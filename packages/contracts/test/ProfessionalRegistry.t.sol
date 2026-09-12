// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProfessionalRegistry} from "../src/ProfessionalRegistry.sol";
import {IKycAdapter} from "../src/IKycAdapter.sol";

/// @dev Mock del adaptador KYC de HashKey; solo se usa en tests.
contract KycMock is IKycAdapter {
    bool public human;
    uint256 public level;
    bool public revertOnCall;

    constructor() {
        human = true;
        level = 1;
    }

    function setHuman(bool h) external {
        human = h;
    }

    function setLevel(uint256 l) external {
        level = l;
    }

    function setRevertOnCall(bool r) external {
        revertOnCall = r;
    }

    function isHuman(address, uint256 minimumLevel) external view returns (bool) {
        if (revertOnCall) {
            revert("kyc unavailable");
        }
        return human && level >= minimumLevel;
    }
}

contract ProfessionalRegistryTest is Test {
    ProfessionalRegistry public registry;
    KycMock public kyc;

    address public admin = makeAddr("admin");
    address public verifier = makeAddr("verifier");
    address public verifier2 = makeAddr("verifier2");
    address public professional = makeAddr("professional");
    address public stranger = makeAddr("stranger");

    bytes32 public key1 = bytes32(uint256(1));
    bytes32 public key2 = bytes32(uint256(2));
    bytes32 public zeroKey = bytes32(0);

    uint256 public duration = 30 days;

    function setUp() public {
        vm.prank(admin);
        registry = new ProfessionalRegistry();
        vm.prank(admin);
        registry.setVerifier(verifier, true);
        kyc = new KycMock();
    }

    /// Helper: el profesional registra su llave y un verificador emite una
    /// credencial vigente y activa.
    function _issueValidCredential() internal {
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(verifier);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
    }

    // ---------------------------------------------------------------------
    // Registro de llave
    // ---------------------------------------------------------------------

    function test_registerKey_professionalRegistersOwnKeyAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.KeyRegistered(professional, key1);
        vm.prank(professional);
        registry.registerKey(key1);
        assertEq(registry.registeredKeys(professional), key1, "key registered");
    }

    function test_registerKey_rejectsZeroKey() public {
        vm.prank(professional);
        vm.expectRevert(ProfessionalRegistry.ZeroKey.selector);
        registry.registerKey(zeroKey);
    }

    function test_registerKey_rejectsDuplicateRegistration() public {
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(professional);
        vm.expectRevert(ProfessionalRegistry.KeyAlreadyRegistered.selector);
        registry.registerKey(key2);
    }

    // ---------------------------------------------------------------------
    // Emisión
    // ---------------------------------------------------------------------

    function test_issue_authorizedVerifierEmitsCredentialAndEvent() public {
        vm.prank(professional);
        registry.registerKey(key1);
        uint40 expiresAt = uint40(block.timestamp + duration);
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.Issued(professional, key1, "Dra. Prueba", expiresAt, verifier);
        vm.prank(verifier);
        registry.issue(professional, "Dra. Prueba", expiresAt);

        (
            bytes32 publicKey,
            string memory displayName,
            ProfessionalRegistry.Status status,
            uint40 expires,
            address issuer
        ) = registry.credentials(professional);
        assertEq(publicKey, key1, "public key is the registered one");
        assertEq(displayName, "Dra. Prueba", "display name");
        assertEq(uint8(status), uint8(ProfessionalRegistry.Status.Active), "status active");
        assertEq(expires, expiresAt, "expiry");
        assertEq(issuer, verifier, "issuer");
        assertTrue(registry.isVerified(professional), "should be verified");
    }

    function test_issue_rejectsMissingRegisteredKey() public {
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.KeyNotRegistered.selector);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
    }

    function test_issue_verifierCannotChooseOrReplaceKey() public {
        // El verificador intenta "sustituir" la llave registrando la suya
        // propia: no puede, registerKey solo acepta la llave del msg.sender.
        vm.prank(verifier);
        registry.registerKey(key2);
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.KeyNotRegistered.selector);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));

        // El profesional registra la suya y el issue copia exactamente esa.
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(verifier);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
        (bytes32 publicKey,,,,) = registry.credentials(professional);
        assertEq(publicKey, key1, "key comes only from the professional");
    }

    function test_issue_rejectsUnauthorizedVerifier() public {
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(stranger);
        vm.expectRevert(ProfessionalRegistry.NotAuthorizedVerifier.selector);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
    }

    function test_issue_rejectsAdminWithoutVerifierRole() public {
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(admin);
        vm.expectRevert(ProfessionalRegistry.NotAuthorizedVerifier.selector);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
    }

    function test_issue_rejectsDuplicateIssuance() public {
        _issueValidCredential();
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.AlreadyIssued.selector);
        registry.issue(professional, "Dra. Segunda", uint40(block.timestamp + duration));
    }

    function test_issue_rejectsZeroInputs() public {
        vm.prank(professional);
        registry.registerKey(key1);

        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.ZeroAddress.selector);
        registry.issue(address(0), "Nombre", uint40(block.timestamp + duration));

        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.EmptyName.selector);
        registry.issue(professional, "", uint40(block.timestamp + duration));
    }

    function test_issue_rejectsNonFutureExpiry() public {
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.InvalidExpiry.selector);
        registry.issue(professional, "Nombre", uint40(block.timestamp));

        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.InvalidExpiry.selector);
        registry.issue(professional, "Nombre", uint40(block.timestamp - 1));
    }

    // ---------------------------------------------------------------------
    // Renovación
    // ---------------------------------------------------------------------

    function test_renew_authorizedVerifierExtendsAndEmits() public {
        _issueValidCredential();
        uint40 newExpiry = uint40(block.timestamp + 365 days);
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.Renewed(professional, newExpiry, verifier);
        vm.prank(verifier);
        registry.renew(professional, newExpiry);

        (,,, uint40 expires,) = registry.credentials(professional);
        assertEq(expires, newExpiry, "new expiry");
    }

    function test_renew_rejectsUnauthorizedVerifier() public {
        _issueValidCredential();
        vm.prank(stranger);
        vm.expectRevert(ProfessionalRegistry.NotAuthorizedVerifier.selector);
        registry.renew(professional, uint40(block.timestamp + 60 days));
    }

    function test_renew_rejectsNonFutureExpiry() public {
        _issueValidCredential();
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.InvalidExpiry.selector);
        registry.renew(professional, uint40(block.timestamp));
    }

    function test_renew_rejectsExpiryEqualToCurrent() public {
        _issueValidCredential();
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.ExpiryNotExtension.selector);
        registry.renew(professional, uint40(block.timestamp + duration));
    }

    function test_renew_rejectsExpiryLowerThanCurrent() public {
        _issueValidCredential();
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.ExpiryNotExtension.selector);
        registry.renew(professional, uint40(block.timestamp + duration - 1 days));
    }

    function test_renew_rejectsMissingCredential() public {
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.CredentialNotFound.selector);
        registry.renew(stranger, uint40(block.timestamp + 60 days));
    }

    function test_renew_suspendedCredentialStaysSuspended() public {
        _issueValidCredential();
        vm.prank(verifier);
        registry.suspend(professional);
        vm.prank(verifier);
        registry.renew(professional, uint40(block.timestamp + 60 days));

        (,, ProfessionalRegistry.Status status,,) = registry.credentials(professional);
        assertEq(uint8(status), uint8(ProfessionalRegistry.Status.Suspended), "stays suspended");
        assertFalse(registry.isVerified(professional), "suspended is never verified");
    }

    // ---------------------------------------------------------------------
    // Suspensión
    // ---------------------------------------------------------------------

    function test_suspend_authorizedVerifierSuspendsAndEmits() public {
        _issueValidCredential();
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.Suspended(professional, verifier);
        vm.prank(verifier);
        registry.suspend(professional);

        (,, ProfessionalRegistry.Status status,,) = registry.credentials(professional);
        assertEq(uint8(status), uint8(ProfessionalRegistry.Status.Suspended), "status suspended");
    }

    function test_suspend_rejectsUnauthorizedVerifier() public {
        _issueValidCredential();
        vm.prank(stranger);
        vm.expectRevert(ProfessionalRegistry.NotAuthorizedVerifier.selector);
        registry.suspend(professional);
    }

    function test_suspend_rejectsMissingCredential() public {
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.CredentialNotFound.selector);
        registry.suspend(stranger);
    }

    function test_suspend_alreadySuspendedStaysSuspended() public {
        _issueValidCredential();
        vm.prank(verifier);
        registry.suspend(professional);
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.AlreadySuspended.selector);
        registry.suspend(professional);
    }

    // ---------------------------------------------------------------------
    // Rotación de llave
    // ---------------------------------------------------------------------

    function test_rotateKey_professionalRotatesOwnKeyAndEmits() public {
        _issueValidCredential();
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.KeyRotated(professional, key2);
        vm.prank(professional);
        registry.rotateKey(key2);

        (bytes32 publicKey,,,,) = registry.credentials(professional);
        assertEq(publicKey, key2, "rotated key");
        assertEq(registry.registeredKeys(professional), key2, "registered key follows rotation");
    }

    function test_rotateKey_worksBeforeIssuanceAndUpdatesRegisteredKeyOnly() public {
        vm.prank(professional);
        registry.registerKey(key1);

        vm.prank(professional);
        registry.rotateKey(key2);
        assertEq(registry.registeredKeys(professional), key2, "registered key rotated");

        // Sin credencial emitida, la rotación no toca Credential (no existe).
        (bytes32 publicKey,,,,) = registry.credentials(professional);
        assertTrue(publicKey == zeroKey, "no credential before issuance");

        // La emisión posterior usa la llave rotada.
        vm.prank(verifier);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
        (bytes32 issuedKey,,,,) = registry.credentials(professional);
        assertEq(issuedKey, key2, "issuance uses the rotated key");
    }

    function test_rotateKey_rejectsRotationWithoutPriorRegistration() public {
        vm.prank(professional);
        vm.expectRevert(ProfessionalRegistry.KeyNotRegistered.selector);
        registry.rotateKey(key2);
    }

    function test_rotateKey_rejectsThirdParty() public {
        _issueValidCredential();
        vm.prank(stranger);
        vm.expectRevert(ProfessionalRegistry.KeyNotRegistered.selector);
        registry.rotateKey(key2);
    }

    function test_rotateKey_rejectsZeroKeyAfterRegistration() public {
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(professional);
        vm.expectRevert(ProfessionalRegistry.ZeroKey.selector);
        registry.rotateKey(zeroKey);
    }

    // ---------------------------------------------------------------------
    // isVerified
    // ---------------------------------------------------------------------

    function test_isVerified_expiredCredentialIsNotVerified() public {
        _issueValidCredential();
        vm.warp(block.timestamp + duration + 1);
        assertFalse(registry.isVerified(professional), "expired is not verified");
    }

    function test_isVerified_expiryEqualToTimestampIsNotVerified() public {
        _issueValidCredential();
        vm.warp(block.timestamp + duration);
        assertFalse(registry.isVerified(professional), "expiry == now is not verified");
    }

    function test_isVerified_missingCredentialIsNotVerified() public {
        assertFalse(registry.isVerified(stranger), "missing is not verified");
    }

    function test_isVerified_disabledVerifierCannotAct() public {
        vm.prank(admin);
        registry.setVerifier(verifier, false);
        vm.prank(verifier);
        vm.expectRevert(ProfessionalRegistry.NotAuthorizedVerifier.selector);
        registry.issue(professional, "Dra. Prueba", uint40(block.timestamp + duration));
    }

    // ---------------------------------------------------------------------
    // Administración de verificadores
    // ---------------------------------------------------------------------

    function test_setVerifier_onlyAdminCanEnableOrDisable() public {
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.VerifierSet(verifier2, true, admin);
        registry.setVerifier(verifier2, true);
        assertTrue(registry.verifiers(verifier2), "verifier2 enabled");

        vm.prank(stranger);
        vm.expectRevert(ProfessionalRegistry.NotAdmin.selector);
        registry.setVerifier(verifier2, false);

        vm.prank(admin);
        registry.setVerifier(verifier2, false);
        assertFalse(registry.verifiers(verifier2), "verifier2 disabled");
    }

    // ---------------------------------------------------------------------
    // KYC
    // ---------------------------------------------------------------------

    function test_kyc_disabledByDefault() public {
        _issueValidCredential();
        assertTrue(registry.isVerified(professional), "verified without kyc");
    }

    function test_kyc_adminCanConfigureAndDisableAdapter() public {
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.KycAdapterSet(kyc, 1, admin);
        registry.setKycAdapter(kyc, 1);
        assertEq(address(registry.kycAdapter()), address(kyc), "adapter set");
        assertEq(registry.kycMinimumLevel(), 1, "level set");

        vm.prank(stranger);
        vm.expectRevert(ProfessionalRegistry.NotAdmin.selector);
        registry.setKycAdapter(kyc, 1);

        // Al desactivar, el evento emite nivel cero y el estado queda en cero.
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit ProfessionalRegistry.KycAdapterSet(IKycAdapter(address(0)), 0, admin);
        registry.setKycAdapter(IKycAdapter(address(0)), 5);
        assertEq(address(registry.kycAdapter()), address(0), "adapter removed");
        assertEq(registry.kycMinimumLevel(), 0, "level reset to zero");
    }

    function test_kyc_validHumanPassesAndInvalidFails() public {
        vm.prank(admin);
        registry.setKycAdapter(kyc, 1);

        _issueValidCredential();
        assertTrue(registry.isVerified(professional), "human passes kyc");

        kyc.setHuman(false);
        assertFalse(registry.isVerified(professional), "non-human fails kyc");

        kyc.setHuman(true);
        kyc.setLevel(0);
        assertFalse(registry.isVerified(professional), "low level fails kyc");
    }

    function test_kyc_adapterRevertIsTreatedAsFalse() public {
        vm.prank(admin);
        registry.setKycAdapter(kyc, 1);
        _issueValidCredential();

        kyc.setRevertOnCall(true);
        assertFalse(registry.isVerified(professional), "reverting adapter is not verified");

        kyc.setRevertOnCall(false);
        assertTrue(registry.isVerified(professional), "recovered adapter verifies again");
    }

    function test_kyc_minimumLevelIsStored() public {
        vm.prank(admin);
        registry.setKycAdapter(kyc, 2);
        assertEq(registry.kycMinimumLevel(), 2, "minimum level stored");

        kyc.setHuman(true);
        kyc.setLevel(2);
        _issueValidCredential();
        assertTrue(registry.isVerified(professional), "level 2 with minimum 2 passes");

        kyc.setLevel(1);
        assertFalse(registry.isVerified(professional), "level 1 with minimum 2 fails");
    }

    // ---------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------

    function testFuzz_issueExpiry_futureTimestampsAreAccepted(uint48 futureDelta) public {
        vm.assume(futureDelta > 0 && futureDelta <= type(uint40).max - block.timestamp);
        uint40 expiresAt = uint40(block.timestamp + futureDelta);
        vm.prank(professional);
        registry.registerKey(key1);
        vm.prank(verifier);
        registry.issue(professional, "Dra. Prueba", expiresAt);
        assertTrue(registry.isVerified(professional));
    }

    function testFuzz_isVerified_expiryBoundary(uint16 pastDays) public {
        _issueValidCredential();
        uint40 issuedExpiry = uint40(block.timestamp + duration);
        vm.warp(uint256(issuedExpiry) + pastDays);
        assertFalse(registry.isVerified(professional), "past expiry is never verified");
    }
}
