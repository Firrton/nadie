// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ConsentRegistry} from "../src/ConsentRegistry.sol";
import {ProfessionalRegistry} from "../src/ProfessionalRegistry.sol";

contract ConsentRegistryTest is Test {
    struct GrantArgs {
        bytes32 consentId;
        address user;
        address professional;
        bytes32 packageHash;
        bytes32 scope;
        uint40 expiresAt;
        uint256 nonce;
        uint256 deadline;
    }

    ProfessionalRegistry public professionalRegistry;
    ConsentRegistry public consent;

    address public admin = makeAddr("admin");
    address public verifier = makeAddr("verifier");
    address public relayer = makeAddr("relayer");
    address public otherRelayer = makeAddr("otherRelayer");
    address public user = makeAddr("user");
    address public otherUser = makeAddr("otherUser");
    address public professional = makeAddr("professional");
    address public stranger = makeAddr("stranger");

    uint256 public userKey;
    uint256 public otherUserKey;

    GrantArgs public g;

    function setUp() public {
        (user, userKey) = makeAddrAndKey("user");
        (otherUser, otherUserKey) = makeAddrAndKey("otherUser");

        vm.prank(admin);
        professionalRegistry = new ProfessionalRegistry();
        vm.prank(admin);
        professionalRegistry.setVerifier(verifier, true);

        consent = new ConsentRegistry(professionalRegistry);

        vm.prank(professional);
        professionalRegistry.registerKey(bytes32(uint256(1)));
        vm.prank(verifier);
        professionalRegistry.issue(professional, "Dra. Prueba", uint40(block.timestamp + 365 days));

        g = GrantArgs({
            consentId: keccak256("consent-1"),
            user: user,
            professional: professional,
            packageHash: bytes32(uint256(0xABC)),
            scope: keccak256("graph-summary"),
            expiresAt: uint40(block.timestamp + 30 days),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _grantDigest(GrantArgs memory a) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NadieConsentRegistry"),
                keccak256("1"),
                block.chainid,
                address(consent)
            )
        );
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(
                        keccak256(
                            "Grant(bytes32 consentId,address user,address professional,bytes32 packageHash,bytes32 scope,uint40 expiresAt,uint256 nonce,uint256 deadline)"
                        ),
                        a.consentId,
                        a.user,
                        a.professional,
                        a.packageHash,
                        a.scope,
                        a.expiresAt,
                        a.nonce,
                        a.deadline
                    )
                )
            )
        );
    }

    function _revokeDigest(bytes32 id, address u, uint256 n, uint256 dl) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NadieConsentRegistry"),
                keccak256("1"),
                block.chainid,
                address(consent)
            )
        );
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(
                        keccak256("Revoke(bytes32 consentId,address user,uint256 nonce,uint256 deadline)"), id, u, n, dl
                    )
                )
            )
        );
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _grantSig(GrantArgs memory a) internal view returns (bytes memory) {
        return _sign(userKey, _grantDigest(a));
    }

    function _grant() internal {
        vm.prank(relayer);
        GrantArgs memory a = g;
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function _revoke(uint256 n) internal {
        vm.prank(relayer);
        consent.revokeWithSig(
            g.consentId, g.user, n, g.deadline, _sign(userKey, _revokeDigest(g.consentId, g.user, n, g.deadline))
        );
    }

    function _open() internal {
        vm.prank(professional);
        consent.open(g.consentId);
    }

    function _consentState()
        internal
        view
        returns (address u, address p, bytes32 pkg, bytes32 sc, uint40 exp, uint40 firstOpened, bool revoked)
    {
        return consent.consents(g.consentId);
    }

    // -----------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------

    function test_constructor_rejectsZeroRegistry() public {
        vm.expectRevert(ConsentRegistry.ZeroRegistry.selector);
        new ConsentRegistry(ProfessionalRegistry(address(0)));
    }

    function test_constructor_storesRegistry() public {
        assertEq(address(consent.professionalRegistry()), address(professionalRegistry));
    }

    // -----------------------------------------------------------------
    // grantWithSig
    // -----------------------------------------------------------------

    function test_grant_arbitraryRelayerCanSubmitValidSignature() public {
        GrantArgs memory a = g;
        vm.expectEmit(true, true, true, true);
        emit ConsentRegistry.Granted(a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt);
        vm.prank(otherRelayer);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );

        (address u, address p, bytes32 pkg, bytes32 sc, uint40 exp, uint40 firstOpened, bool revoked) = _consentState();
        assertEq(u, a.user, "user");
        assertEq(p, a.professional, "professional");
        assertEq(pkg, a.packageHash, "packageHash");
        assertEq(sc, a.scope, "scope");
        assertEq(exp, a.expiresAt, "expiresAt");
        assertEq(firstOpened, 0, "firstOpenedAt");
        assertFalse(revoked, "revoked");
        assertEq(consent.nonces(a.user), 1, "nonce incremented");
        assertTrue(consent.isValid(a.consentId), "valid after grant");
    }

    function test_grant_rejectsUnverifiedProfessional() public {
        vm.prank(verifier);
        professionalRegistry.suspend(professional);
        GrantArgs memory a = g;
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ProfessionalNotVerified.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsNonexistentProfessional() public {
        GrantArgs memory a = g;
        a.professional = stranger;
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ProfessionalNotVerified.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsExpiredProfessionalCredential() public {
        // La credencial profesional vence en 365 dias: warp mas alla. El
        // consentimiento y el deadline se extienden para no ensuciar el error.
        GrantArgs memory a = g;
        uint256 newNow = block.timestamp + 366 days;
        a.expiresAt = uint40(newNow + 30 days);
        a.deadline = newNow + 1 hours;
        vm.warp(newNow);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ProfessionalNotVerified.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsZeroConsentId() public {
        GrantArgs memory a = g;
        a.consentId = bytes32(0);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ZeroConsentId.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsZeroUser() public {
        GrantArgs memory a = g;
        a.user = address(0);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ZeroAddress.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsZeroProfessional() public {
        GrantArgs memory a = g;
        a.professional = address(0);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ZeroAddress.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsZeroPackageHash() public {
        GrantArgs memory a = g;
        a.packageHash = bytes32(0);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ZeroHash.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsZeroScope() public {
        GrantArgs memory a = g;
        a.scope = bytes32(0);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ZeroHash.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsNonFutureExpiry() public {
        GrantArgs memory a = g;
        a.expiresAt = uint40(block.timestamp);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidExpiry.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );

        a.expiresAt = uint40(block.timestamp - 1);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidExpiry.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsWrongSigner() public {
        GrantArgs memory a = g;
        bytes memory sig = _sign(otherUserKey, _grantDigest(a));
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, sig
        );
    }

    function test_grant_rejectsWrongNonce() public {
        GrantArgs memory a = g;
        a.nonce = 5;
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidNonce.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsExpiredDeadline() public {
        GrantArgs memory a = g;
        a.deadline = block.timestamp - 1;
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.DeadlineExpired.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_acceptsDeadlineEqualToNow() public {
        GrantArgs memory a = g;
        a.deadline = block.timestamp;
        vm.prank(relayer);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
        assertTrue(consent.isValid(a.consentId), "deadline == now is accepted");
    }

    function test_grant_rejectsWrongChainIdDomain() public {
        GrantArgs memory a = g;
        bytes memory sig = _grantSig(a);
        uint256 realChainId = block.chainid;
        vm.chainId(realChainId + 1);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, sig
        );
        vm.chainId(realChainId);
    }

    function test_grant_rejectsWrongVerifyingContract() public {
        // Firma hecha contra un dominio cuyo verifyingContract difiere del real.
        GrantArgs memory a = g;
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NadieConsentRegistry"),
                keccak256("1"),
                block.chainid,
                address(uint160(uint256(uint160(address(consent))) + 1))
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(
                        keccak256(
                            "Grant(bytes32 consentId,address user,address professional,bytes32 packageHash,bytes32 scope,uint40 expiresAt,uint256 nonce,uint256 deadline)"
                        ),
                        a.consentId,
                        a.user,
                        a.professional,
                        a.packageHash,
                        a.scope,
                        a.expiresAt,
                        a.nonce,
                        a.deadline
                    )
                )
            )
        );
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.grantWithSig(
            a.consentId,
            a.user,
            a.professional,
            a.packageHash,
            a.scope,
            a.expiresAt,
            a.nonce,
            a.deadline,
            _sign(userKey, digest)
        );
    }

    function test_grant_rejectsShortSignature() public {
        GrantArgs memory a = g;
        bytes memory good = _grantSig(a);
        bytes memory shortSig = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            shortSig[i] = good[i];
        }
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, shortSig
        );
    }

    function test_grant_rejectsInvalidV() public {
        GrantArgs memory a = g;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, _grantDigest(a));
        assertLt(v, 29); // v es 27 o 28
        bytes memory badV = abi.encodePacked(r, s, uint8(0));
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, badV
        );
    }

    function test_grant_rejectsHighS() public {
        GrantArgs memory a = g;
        (, bytes32 r, bytes32 s) = vm.sign(userKey, _grantDigest(a));
        bytes32 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(uint256(n) - uint256(s));
        bytes memory highSig = abi.encodePacked(r, highS, uint8(28));
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        _submitGrant(a, highSig);
    }

    function _submitGrant(GrantArgs memory a, bytes memory sig) internal {
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, sig
        );
    }

    function test_grant_rejectsReplay() public {
        _grant();
        GrantArgs memory a = g;
        vm.prank(otherRelayer);
        vm.expectRevert(ConsentRegistry.InvalidNonce.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    function test_grant_rejectsDuplicateConsentId() public {
        _grant();
        GrantArgs memory a = g;
        a.nonce = 1;
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ConsentAlreadyExists.selector);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
    }

    // -----------------------------------------------------------------
    // isValid
    // -----------------------------------------------------------------

    function test_isValid_changesByExpiry() public {
        _grant();
        uint40 expiry = g.expiresAt;
        assertTrue(consent.isValid(g.consentId));
        vm.warp(expiry);
        assertFalse(consent.isValid(g.consentId), "expiry == now is invalid");
        vm.warp(expiry + 1);
        assertFalse(consent.isValid(g.consentId), "expired");
    }

    function test_isValid_changesByRevocation() public {
        _grant();
        assertTrue(consent.isValid(g.consentId));
        _revoke(1);
        assertFalse(consent.isValid(g.consentId), "revoked");
    }

    function test_isValid_changesByLaterSuspension() public {
        _grant();
        assertTrue(consent.isValid(g.consentId));
        vm.prank(verifier);
        professionalRegistry.suspend(professional);
        assertFalse(consent.isValid(g.consentId), "suspended professional invalidates consent");
    }

    function test_isValid_nonexistentIsFalse() public {
        assertFalse(consent.isValid(keccak256("nope")));
    }

    // -----------------------------------------------------------------
    // revokeWithSig
    // -----------------------------------------------------------------

    function test_revoke_successAndEvent() public {
        _grant();
        vm.expectEmit(true, true, true, true);
        emit ConsentRegistry.Revoked(g.consentId, g.user);
        _revoke(1);

        (,,,,,, bool revoked) = _consentState();
        assertTrue(revoked, "revoked state");
        assertEq(consent.nonces(g.user), 2, "nonce incremented");
        assertFalse(consent.isValid(g.consentId));
    }

    function test_revoke_rejectsNonexistentConsent() public {
        bytes32 id = keccak256("nope");
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.ConsentNotFound.selector);
        consent.revokeWithSig(
            id, user, 0, block.timestamp + 1, _sign(userKey, _revokeDigest(id, user, 0, block.timestamp + 1))
        );
    }

    function test_revoke_rejectsWrongUser() public {
        _grant();
        // otherUser firma un revoke de un consent que pertenece a user.
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(
            g.consentId,
            otherUser,
            1,
            g.deadline,
            _sign(otherUserKey, _revokeDigest(g.consentId, otherUser, 1, g.deadline))
        );
    }

    function test_revoke_rejectsDoubleRevoke() public {
        _grant();
        _revoke(1);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.AlreadyRevoked.selector);
        consent.revokeWithSig(
            g.consentId, g.user, 2, g.deadline, _sign(userKey, _revokeDigest(g.consentId, g.user, 2, g.deadline))
        );
    }

    function test_revoke_allowedAfterExpiry() public {
        _grant();
        uint256 newNow = g.expiresAt + 1;
        vm.warp(newNow);
        vm.prank(relayer);
        uint256 dl = newNow + 1 hours;
        consent.revokeWithSig(g.consentId, g.user, 1, dl, _sign(userKey, _revokeDigest(g.consentId, g.user, 1, dl)));
        (,,,,,, bool revoked) = _consentState();
        assertTrue(revoked, "revoked even after expiry");
    }

    function test_revoke_allowedAfterSuspension() public {
        _grant();
        vm.prank(verifier);
        professionalRegistry.suspend(professional);
        _revoke(1);
        (,,,,,, bool revoked) = _consentState();
        assertTrue(revoked, "revoked even after suspension");
    }

    function test_revoke_rejectsWrongNonceDeadlineAndShortSignature() public {
        _grant();
        bytes32 id = g.consentId;
        address u = g.user;
        uint256 dl = g.deadline;

        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidNonce.selector);
        consent.revokeWithSig(id, u, 7, dl, _sign(userKey, _revokeDigest(id, u, 7, dl)));

        uint256 pastDl = block.timestamp - 1;
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.DeadlineExpired.selector);
        consent.revokeWithSig(id, u, 1, pastDl, _sign(userKey, _revokeDigest(id, u, 1, pastDl)));

        bytes memory good = _sign(userKey, _revokeDigest(id, u, 1, dl));
        bytes memory shortSig = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            shortSig[i] = good[i];
        }
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(id, u, 1, dl, shortSig);
    }

    // -----------------------------------------------------------------
    // revokeWithSig: firmas inválidas y replay
    // -----------------------------------------------------------------

    function test_revoke_rejectsSignatureByOtherSigner() public {
        _grant();
        // Firma de otherUser presentada como si fuera de user.
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(
            g.consentId, g.user, 1, g.deadline, _sign(otherUserKey, _revokeDigest(g.consentId, g.user, 1, g.deadline))
        );
    }

    function test_revoke_rejectsWrongChainIdDomain() public {
        _grant();
        // Firma hecha con el chainId actual; luego se cambia el chainId.
        bytes memory sig = _sign(userKey, _revokeDigest(g.consentId, g.user, 1, g.deadline));
        uint256 realChainId = block.chainid;
        vm.chainId(realChainId + 1);
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(g.consentId, g.user, 1, g.deadline, sig);
        vm.chainId(realChainId);
    }

    function test_revoke_rejectsWrongVerifyingContract() public {
        _grant();
        // Dominio con verifyingContract distinto a address(consent).
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NadieConsentRegistry"),
                keccak256("1"),
                block.chainid,
                address(uint160(uint256(uint160(address(consent))) + 1))
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(
                        keccak256("Revoke(bytes32 consentId,address user,uint256 nonce,uint256 deadline)"),
                        g.consentId,
                        g.user,
                        uint256(1),
                        g.deadline
                    )
                )
            )
        );
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(g.consentId, g.user, 1, g.deadline, _sign(userKey, digest));
    }

    function test_revoke_rejectsInvalidV() public {
        _grant();
        (, bytes32 r, bytes32 s) = vm.sign(userKey, _revokeDigest(g.consentId, g.user, 1, g.deadline));
        bytes memory badV = abi.encodePacked(r, s, uint8(0));
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(g.consentId, g.user, 1, g.deadline, badV);
    }

    function test_revoke_rejectsHighS() public {
        _grant();
        (, bytes32 r, bytes32 s) = vm.sign(userKey, _revokeDigest(g.consentId, g.user, 1, g.deadline));
        bytes32 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(uint256(n) - uint256(s));
        bytes memory highSig = abi.encodePacked(r, highS, uint8(28));
        vm.prank(relayer);
        vm.expectRevert(ConsentRegistry.InvalidSignature.selector);
        consent.revokeWithSig(g.consentId, g.user, 1, g.deadline, highSig);
    }

    function test_revoke_rejectsExactReplayOfExecutedRevocation() public {
        _grant();
        bytes32 id = g.consentId;
        address u = g.user;
        uint256 n = 1;
        uint256 dl = g.deadline;
        bytes memory sig = _sign(userKey, _revokeDigest(id, u, n, dl));
        vm.prank(relayer);
        consent.revokeWithSig(id, u, n, dl, sig);
        // Replay exacto por otro relayer: el nonce ya se consumió.
        vm.prank(otherRelayer);
        vm.expectRevert(ConsentRegistry.InvalidNonce.selector);
        consent.revokeWithSig(id, u, n, dl, sig);
    }

    // -----------------------------------------------------------------
    // open
    // -----------------------------------------------------------------

    function test_open_firstOpenSetsTimestampAndEmits() public {
        _grant();
        vm.expectEmit(true, true, true, true);
        emit ConsentRegistry.Opened(g.consentId, professional, uint40(block.timestamp));
        _open();
        (,,,,, uint40 firstOpened,) = _consentState();
        assertEq(firstOpened, block.timestamp, "firstOpenedAt set");
    }

    function test_open_secondOpenKeepsTimestampAndDoesNotEmit() public {
        _grant();
        _open();
        uint40 first = uint40(block.timestamp);
        vm.warp(block.timestamp + 1 hours);
        vm.recordLogs();
        _open();
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i = 0; i < entries.length; i++) {
            bytes32 topic0 = entries[i].topics[0];
            // No debe emitirse otro Opened.
            bytes32 openedTopic = ConsentRegistry.Opened.selector;
            assertFalse(topic0 == openedTopic, "second open must not emit Opened");
        }
        (,,,,, uint40 firstOpened,) = _consentState();
        assertEq(firstOpened, first, "firstOpenedAt unchanged");
    }

    function test_open_rejectsUnauthorizedCaller() public {
        _grant();
        vm.prank(stranger);
        vm.expectRevert(ConsentRegistry.NotAuthorizedProfessional.selector);
        consent.open(g.consentId);
    }

    function test_open_rejectsRevoked() public {
        _grant();
        _revoke(1);
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ConsentNotValid.selector);
        consent.open(g.consentId);
    }

    function test_open_rejectsExpired() public {
        _grant();
        vm.warp(g.expiresAt);
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ConsentNotValid.selector);
        consent.open(g.consentId);
    }

    function test_open_rejectsSuspendedProfessional() public {
        _grant();
        vm.prank(verifier);
        professionalRegistry.suspend(professional);
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ConsentNotValid.selector);
        consent.open(g.consentId);
    }

    function test_open_rejectsNonexistent() public {
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ConsentNotFound.selector);
        consent.open(keccak256("nope"));
    }

    // -----------------------------------------------------------------
    // reply
    // -----------------------------------------------------------------

    function test_reply_successAndEvent() public {
        _grant();
        _open();
        bytes32 responseHash = keccak256("respuesta-cifrada");
        vm.expectEmit(true, true, true, true);
        emit ConsentRegistry.Replied(g.consentId, responseHash);
        vm.prank(professional);
        consent.reply(g.consentId, responseHash);

        // La respuesta no se almacena: el getter sigue igual.
        (address u, address p, bytes32 pkg, bytes32 sc, uint40 exp, uint40 firstOpened, bool revoked) = _consentState();
        assertEq(u, g.user);
        assertEq(p, g.professional);
        assertEq(pkg, g.packageHash);
        assertEq(sc, g.scope);
        assertEq(exp, g.expiresAt);
        assertTrue(firstOpened > 0);
        assertFalse(revoked);
    }

    function test_reply_rejectsNonProfessionalCaller() public {
        _grant();
        _open();
        vm.prank(stranger);
        vm.expectRevert(ConsentRegistry.NotAuthorizedProfessional.selector);
        consent.reply(g.consentId, keccak256("respuesta"));
    }

    function test_reply_rejectsNotOpened() public {
        _grant();
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.NotOpened.selector);
        consent.reply(g.consentId, keccak256("respuesta"));
    }

    function test_reply_rejectsInvalidConsent() public {
        _grant();
        _open();
        vm.warp(g.expiresAt);
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ConsentNotValid.selector);
        consent.reply(g.consentId, keccak256("respuesta"));
    }

    function test_reply_rejectsZeroHash() public {
        _grant();
        _open();
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ZeroHash.selector);
        consent.reply(g.consentId, bytes32(0));
    }

    function test_reply_rejectsNonexistent() public {
        vm.prank(professional);
        vm.expectRevert(ConsentRegistry.ConsentNotFound.selector);
        consent.reply(keccak256("nope"), keccak256("respuesta"));
    }

    // -----------------------------------------------------------------
    // Fuzz
    // -----------------------------------------------------------------

    function testFuzz_grant_futureExpiriesAreAccepted(uint48 expiryDelta) public {
        vm.assume(expiryDelta > 0 && expiryDelta <= type(uint40).max - block.timestamp);
        GrantArgs memory a = g;
        a.expiresAt = uint40(block.timestamp + expiryDelta);
        vm.prank(relayer);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, _grantSig(a)
        );
        assertTrue(consent.isValid(a.consentId));
    }

    function testFuzz_isValid_expiryBoundary(uint16 pastDelta) public {
        _grant();
        vm.warp(g.expiresAt + pastDelta);
        assertFalse(consent.isValid(g.consentId));
    }

    function testFuzz_grant_anyRelayerCanSubmit(uint160 relayerSeed) public {
        address anyRelayer = address(relayerSeed);
        vm.assume(anyRelayer != address(0));
        GrantArgs memory a = g;
        bytes memory sig = _grantSig(a);
        vm.prank(anyRelayer);
        consent.grantWithSig(
            a.consentId, a.user, a.professional, a.packageHash, a.scope, a.expiresAt, a.nonce, a.deadline, sig
        );
        assertTrue(consent.isValid(a.consentId));
    }

    function testFuzz_revoke_futureDeadlinesAreAccepted(uint48 deadlineDelta) public {
        vm.assume(deadlineDelta > 0 && deadlineDelta <= type(uint40).max - block.timestamp);
        _grant();
        uint256 dl = block.timestamp + deadlineDelta;
        vm.prank(relayer);
        consent.revokeWithSig(g.consentId, g.user, 1, dl, _sign(userKey, _revokeDigest(g.consentId, g.user, 1, dl)));
        assertFalse(consent.isValid(g.consentId));
    }
}
