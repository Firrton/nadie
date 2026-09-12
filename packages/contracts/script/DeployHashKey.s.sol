// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ProfessionalRegistry} from "../src/ProfessionalRegistry.sol";
import {ConsentRegistry} from "../src/ConsentRegistry.sol";
import {IKycAdapter} from "../src/IKycAdapter.sol";

/// @title DeployHashKey
/// @notice Despliega ProfessionalRegistry + ConsentRegistry en HashKey Testnet (133).
/// @dev Todas las validaciones se completan ANTES del broadcast. Solo se
///      imprimen direcciones públicas, nunca secretos.
///      RIESGO OPERATIVO: el deployer queda como admin INMUTABLE de
///      ProfessionalRegistry. Si se pierde esa clave, no se puede habilitar
///      ni deshabilitar verificadores ni configurar KYC. Usar una clave
///      dedicada de testnet y respaldarla antes del broadcast.
contract DeployHashKey is Script {
    /// @dev Chain ID de HashKey Chain Testnet.
    uint256 private constant HASHKEY_CHAIN_ID = 133;

    error DeployHashKey_WrongChainId(uint256 chainId);
    error DeployHashKey_MissingDeployerKey();
    error DeployHashKey_ZeroVerifier();
    error DeployHashKey_InconsistentKyc();

    // -----------------------------------------------------------------
    // Validaciones (antes de broadcast)
    // -----------------------------------------------------------------

    /// @dev Lee las variables de entorno y delega la validación a la
    ///      función pura. Pública para que los tests la verifiquen.
    function validate() public view returns (address verifier, IKycAdapter adapter, uint256 minimumLevel) {
        if (block.chainid != HASHKEY_CHAIN_ID) {
            revert DeployHashKey_WrongChainId(block.chainid);
        }

        // La clave del deployer se lee del entorno pero jamás se imprime.
        string memory deployerKey = vm.envString("DEPLOYER_PRIVATE_KEY");
        if (bytes(deployerKey).length == 0) {
            revert DeployHashKey_MissingDeployerKey();
        }

        verifier = vm.envAddress("PROFESSIONAL_VERIFIER_ADDRESS");
        adapter = IKycAdapter(vm.envOr("KYC_ADAPTER_ADDRESS", address(0)));
        minimumLevel = vm.envOr("KYC_MINIMUM_LEVEL", uint256(0));

        return _validateInputs(verifier, adapter, minimumLevel);
    }

    /// @dev Validación pura, sin lectura de entorno: testeable sin vm.setEnv.
    function _validateInputs(address verifier, IKycAdapter adapter, uint256 minimumLevel)
        public
        pure
        returns (address, IKycAdapter, uint256)
    {
        if (verifier == address(0)) {
            revert DeployHashKey_ZeroVerifier();
        }
        if (address(adapter) == address(0) && minimumLevel != 0) {
            revert DeployHashKey_InconsistentKyc();
        }
        return (verifier, adapter, minimumLevel);
    }

    // -----------------------------------------------------------------
    // Despliegue
    // -----------------------------------------------------------------

    /// @notice Ejecuta el despliegue completo. El orden es obligatorio:
    ///         ProfessionalRegistry -> verifier -> KYC (si aplica) -> ConsentRegistry.
    function run() external {
        (address verifier, IKycAdapter adapter, uint256 minimumLevel) = validate();

        // Broadcast con la clave del entorno (packages/contracts/.env); jamás
        // se pasa por línea de comandos.
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // 1) ProfessionalRegistry. El deployer (admin) queda inmutable.
        ProfessionalRegistry professionalRegistry = new ProfessionalRegistry();

        // 2) Habilitar el verificador de credenciales.
        professionalRegistry.setVerifier(verifier, true);

        // 3) KYC solo cuando exista adapter.
        if (address(adapter) != address(0)) {
            professionalRegistry.setKycAdapter(adapter, minimumLevel);
        }

        // 4) ConsentRegistry conectado al registro desplegado.
        ConsentRegistry consentRegistry = new ConsentRegistry(professionalRegistry);

        vm.stopBroadcast();

        // Solo direcciones públicas; nunca secretos ni claves.
        console2.log("ProfessionalRegistry:", address(professionalRegistry));
        console2.log("ConsentRegistry:", address(consentRegistry));
    }
}
