// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployHashKey} from "../script/DeployHashKey.s.sol";
import {ProfessionalRegistry} from "../src/ProfessionalRegistry.sol";
import {ConsentRegistry} from "../src/ConsentRegistry.sol";
import {IKycAdapter} from "../src/IKycAdapter.sol";

/// @dev Mock del adaptador KYC para los tests del script.
contract KycMock is IKycAdapter {
    function isHuman(address, uint256) external pure returns (bool) {
        return true;
    }
}

/// @dev Test del flujo de despliegue. Usa vm.envOr/vm.envString con valores
///      sintéticos; nunca claves reales.
contract DeployHashKeyTest is Test {
    uint256 private constant HASHKEY_CHAIN_ID = 133;

    address internal deployer = makeAddr("deployer");
    address internal verifier = makeAddr("verifier");
    IKycAdapter internal adapter = new KycMock();

    ProfessionalRegistry internal professionalRegistry;
    ConsentRegistry internal consentRegistry;
    DeployHashKey internal deployScript;

    function setUp() public {
        deployScript = new DeployHashKey();
        // El entorno se fija UNA vez, con los valores por defecto. Ningún
        // test lo muta: la validación se prueba contra la función pura
        // _validateInputs, así no existe contaminación entre tests.
        vm.setEnv("DEPLOYER_PRIVATE_KEY", "0xA11CE");
        vm.setEnv("PROFESSIONAL_VERIFIER_ADDRESS", vm.toString(verifier));
        vm.setEnv("KYC_ADAPTER_ADDRESS", vm.toString(address(0)));
        vm.setEnv("KYC_MINIMUM_LEVEL", "0");
        vm.chainId(HASHKEY_CHAIN_ID);

        deployer = vm.addr(0xA11CE);
        vm.deal(deployer, 1 ether);
    }

    /// @dev Despliegue fresco con los valores pedidos, sin tocar el entorno.
    function _deploy(address verifierArg, IKycAdapter adapterArg, uint256 levelArg) internal {
        vm.startBroadcast(deployer);
        professionalRegistry = new ProfessionalRegistry();
        professionalRegistry.setVerifier(verifierArg, true);
        if (address(adapterArg) != address(0)) {
            professionalRegistry.setKycAdapter(adapterArg, levelArg);
        }
        consentRegistry = new ConsentRegistry(professionalRegistry);
        vm.stopBroadcast();
    }

    // -----------------------------------------------------------------
    // Validación pura (sin vm.setEnv: sin contaminación posible)
    // -----------------------------------------------------------------

    function test_validate_rejectsZeroVerifier() public {
        vm.expectRevert(DeployHashKey.DeployHashKey_ZeroVerifier.selector);
        deployScript._validateInputs(address(0), adapter, 0);
    }

    function test_validate_rejectsInconsistentKyc() public {
        vm.expectRevert(DeployHashKey.DeployHashKey_InconsistentKyc.selector);
        deployScript._validateInputs(verifier, IKycAdapter(address(0)), 1);
    }

    function test_validate_acceptsDefaults() public view {
        (address v, IKycAdapter a, uint256 level) = deployScript._validateInputs(verifier, IKycAdapter(address(0)), 0);
        assertEq(v, verifier, "verifier");
        assertEq(address(a), address(0), "no adapter by default");
        assertEq(level, 0, "level zero by default");
    }

    function test_validate_acceptsKycWithAdapter() public view {
        (address v, IKycAdapter a, uint256 level) = deployScript._validateInputs(verifier, adapter, 2);
        assertEq(v, verifier);
        assertEq(address(a), address(adapter));
        assertEq(level, 2);
    }

    // -----------------------------------------------------------------
    // validate() con entorno: solo lectura, valores del setUp
    // -----------------------------------------------------------------

    function test_validate_readsEnvAndPasses() public {
        (address v, IKycAdapter a, uint256 level) = deployScript.validate();
        assertEq(v, verifier, "verifier from env");
        assertEq(address(a), address(0), "no adapter from env");
        assertEq(level, 0, "level zero from env");
    }

    function test_validate_rejectsWrongChainId() public {
        vm.chainId(1337);
        vm.expectRevert(abi.encodeWithSelector(DeployHashKey.DeployHashKey_WrongChainId.selector, 1337));
        deployScript.validate();
    }

    // -----------------------------------------------------------------
    // Orden y wiring del despliegue
    // -----------------------------------------------------------------

    function test_deploy_adminIsDeployer() public {
        _deploy(verifier, IKycAdapter(address(0)), 0);
        assertEq(professionalRegistry.admin(), deployer, "admin == deployer");
    }

    function test_deploy_verifierEnabled() public {
        _deploy(verifier, IKycAdapter(address(0)), 0);
        assertTrue(professionalRegistry.verifiers(verifier), "verifier enabled");
    }

    function test_deploy_kycNotConfiguredWithoutAdapter() public {
        _deploy(verifier, IKycAdapter(address(0)), 0);
        assertEq(address(professionalRegistry.kycAdapter()), address(0), "no adapter");
        assertEq(professionalRegistry.kycMinimumLevel(), 0, "level zero");
    }

    function test_deploy_kycConfiguredWhenAdapterProvided() public {
        _deploy(verifier, adapter, 2);
        assertEq(address(professionalRegistry.kycAdapter()), address(adapter));
        assertEq(professionalRegistry.kycMinimumLevel(), 2);
    }

    function test_deploy_consentRegistryWiredToProfessionalRegistry() public {
        _deploy(verifier, IKycAdapter(address(0)), 0);
        assertEq(
            address(consentRegistry.professionalRegistry()),
            address(professionalRegistry),
            "ConsentRegistry points to deployed ProfessionalRegistry"
        );
    }

    function test_deploy_consentsStartEmptyAndValidIsFalse() public {
        _deploy(verifier, IKycAdapter(address(0)), 0);
        // El registro desplegado está funcional: un consent inexistente es inválido.
        assertFalse(consentRegistry.isValid(keccak256("nada")));
    }

    // -----------------------------------------------------------------
    // Fuzz: el validate nunca acepta chain != 133
    // -----------------------------------------------------------------

    function testFuzz_validate_rejectsAnyOtherChainId(uint64 chainSeed) public {
        vm.assume(chainSeed != HASHKEY_CHAIN_ID);
        vm.chainId(chainSeed);
        vm.expectRevert(abi.encodeWithSelector(DeployHashKey.DeployHashKey_WrongChainId.selector, chainSeed));
        deployScript.validate();
    }
}
