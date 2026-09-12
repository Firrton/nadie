// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ProfessionalRegistry} from "./ProfessionalRegistry.sol";

/// @title ConsentRegistry
/// @notice Registro on-chain de consentimientos de acceso a paquetes cifrados.
/// @dev El 2-de-2: la IA prepara, la persona firma EIP-712 y cualquier relayer
///      puede presentar la firma. On-chain solo hay direcciones, hashes,
///      etiquetas de alcance, enteros y timestamps: nunca conversaciones,
///      notas, memorias ni resúmenes en texto claro.
contract ConsentRegistry {
    // ---------------------------------------------------------------------
    // Errores
    // ---------------------------------------------------------------------

    error ZeroRegistry();
    error ZeroConsentId();
    error ZeroAddress();
    error ZeroHash();
    error InvalidExpiry();
    error InvalidSignature();
    error InvalidNonce();
    error DeadlineExpired();
    error ProfessionalNotVerified();
    error ConsentAlreadyExists();
    error ConsentNotValid();
    error ConsentNotFound();
    error AlreadyRevoked();
    error NotAuthorizedProfessional();
    error NotOpened();

    // ---------------------------------------------------------------------
    // Tipos y almacenamiento
    // ---------------------------------------------------------------------

    struct Consent {
        address user;
        address professional;
        bytes32 packageHash;
        bytes32 scope;
        uint40 expiresAt;
        uint40 firstOpenedAt;
        bool revoked;
    }

    ProfessionalRegistry public immutable professionalRegistry;

    mapping(bytes32 => Consent) private _consents;
    /// @dev Nonce monotónico compartido entre grant y revoke por usuario.
    mapping(address => uint256) public nonces;

    // ---------------------------------------------------------------------
    // Eventos
    // ---------------------------------------------------------------------

    event Granted(
        bytes32 indexed consentId,
        address indexed user,
        address indexed professional,
        bytes32 packageHash,
        bytes32 scope,
        uint40 expiresAt
    );
    event Opened(bytes32 indexed consentId, address indexed professional, uint40 firstOpenedAt);
    event Revoked(bytes32 indexed consentId, address indexed user);
    event Replied(bytes32 indexed consentId, bytes32 responseHash);

    // ---------------------------------------------------------------------
    // EIP-712
    // ---------------------------------------------------------------------

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _GRANT_TYPEHASH = keccak256(
        "Grant(bytes32 consentId,address user,address professional,bytes32 packageHash,bytes32 scope,uint40 expiresAt,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant _REVOKE_TYPEHASH =
        keccak256("Revoke(bytes32 consentId,address user,uint256 nonce,uint256 deadline)");

    /// @dev Separador de dominio: ligado a block.chainid y address(this).
    ///      Se recalcula si el chainId cambia.
    bytes32 private _cachedDomainSeparator;
    uint256 private immutable _cachedChainId;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(ProfessionalRegistry registry) {
        if (address(registry) == address(0)) {
            revert ZeroRegistry();
        }
        professionalRegistry = registry;
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _computeDomainSeparator();
    }

    function _domainSeparator() private view returns (bytes32) {
        if (block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }
        return _computeDomainSeparator();
    }

    function _computeDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                _DOMAIN_TYPEHASH, keccak256("NadieConsentRegistry"), keccak256("1"), block.chainid, address(this)
            )
        );
    }

    // ---------------------------------------------------------------------
    // API
    // ---------------------------------------------------------------------

    /// @notice Crea un permiso a partir de la firma EIP-712 del usuario.
    /// @dev Cualquier relayer puede presentar una firma válida sin
    ///      privilegios adicionales. El signer debe ser `user`.
    function grantWithSig(
        bytes32 consentId,
        address user,
        address professional,
        bytes32 packageHash,
        bytes32 scope,
        uint40 expiresAt,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (consentId == bytes32(0)) {
            revert ZeroConsentId();
        }
        if (user == address(0) || professional == address(0)) {
            revert ZeroAddress();
        }
        if (packageHash == bytes32(0) || scope == bytes32(0)) {
            revert ZeroHash();
        }
        if (expiresAt <= block.timestamp) {
            revert InvalidExpiry();
        }
        if (deadline < block.timestamp) {
            revert DeadlineExpired();
        }
        if (!professionalRegistry.isVerified(professional)) {
            revert ProfessionalNotVerified();
        }

        // Firma y nonce se validan ANTES de la existencia del ID: el replay se
        // detecta por nonce aunque el consentId ya exista.
        _verifyGrant(consentId, user, professional, packageHash, scope, expiresAt, nonce, deadline, signature);
        nonces[user] = nonce + 1;

        if (_consents[consentId].user != address(0)) {
            revert ConsentAlreadyExists();
        }

        _consents[consentId] = Consent(user, professional, packageHash, scope, expiresAt, 0, false);
        emit Granted(consentId, user, professional, packageHash, scope, expiresAt);
    }

    /// @notice Revoca con la firma EIP-712 del usuario.
    /// @dev Permitido aunque el consentimiento haya expirado o el profesional
    ///      esté suspendido: corta el acceso futuro.
    function revokeWithSig(bytes32 consentId, address user, uint256 nonce, uint256 deadline, bytes calldata signature)
        external
    {
        if (deadline < block.timestamp) {
            revert DeadlineExpired();
        }
        Consent storage consent = _consents[consentId];
        if (consent.user == address(0)) {
            revert ConsentNotFound();
        }
        if (consent.user != user) {
            revert InvalidSignature();
        }

        // Firma y nonce se validan antes del estado de revocación: el replay
        // exacto de una revocación ejecutada se detecta por nonce consumido.
        _verifyRevoke(consentId, user, nonce, deadline, signature);
        nonces[user] = nonce + 1;

        if (consent.revoked) {
            revert AlreadyRevoked();
        }

        consent.revoked = true;
        emit Revoked(consentId, user);
    }

    /// @notice Solo el profesional autorizado, con consentimiento válido.
    /// @dev La primera llamada exitosa fija firstOpenedAt y emite Opened; las
    ///      siguientes no alteran ese registro ni emiten.
    function open(bytes32 consentId) external {
        Consent storage consent = _consents[consentId];
        if (consent.user == address(0)) {
            revert ConsentNotFound();
        }
        if (msg.sender != consent.professional) {
            revert NotAuthorizedProfessional();
        }
        if (!isValid(consentId)) {
            revert ConsentNotValid();
        }

        if (consent.firstOpenedAt == 0) {
            consent.firstOpenedAt = uint40(block.timestamp);
            emit Opened(consentId, msg.sender, consent.firstOpenedAt);
        }
    }

    /// @notice Solo el profesional, con consentimiento válido y ya abierto.
    /// @dev No almacena la respuesta: emite consentId y responseHash.
    function reply(bytes32 consentId, bytes32 responseHash) external {
        if (responseHash == bytes32(0)) {
            revert ZeroHash();
        }
        Consent storage consent = _consents[consentId];
        if (consent.user == address(0)) {
            revert ConsentNotFound();
        }
        if (msg.sender != consent.professional) {
            revert NotAuthorizedProfessional();
        }
        if (consent.firstOpenedAt == 0) {
            revert NotOpened();
        }
        if (!isValid(consentId)) {
            revert ConsentNotValid();
        }

        emit Replied(consentId, responseHash);
    }

    /// @notice No revocado, no vencido y profesional verificado ahora.
    function isValid(bytes32 consentId) public view returns (bool) {
        Consent storage consent = _consents[consentId];
        if (consent.user == address(0)) {
            return false;
        }
        if (consent.revoked) {
            return false;
        }
        if (consent.expiresAt <= block.timestamp) {
            return false;
        }
        return professionalRegistry.isVerified(consent.professional);
    }

    /// @notice Getter de un consentimiento.
    function consents(bytes32 consentId)
        external
        view
        returns (
            address user,
            address professional,
            bytes32 packageHash,
            bytes32 scope,
            uint40 expiresAt,
            uint40 firstOpenedAt,
            bool revoked
        )
    {
        Consent storage consent = _consents[consentId];
        return (
            consent.user,
            consent.professional,
            consent.packageHash,
            consent.scope,
            consent.expiresAt,
            consent.firstOpenedAt,
            consent.revoked
        );
    }

    // ---------------------------------------------------------------------
    // Verificación de firmas EOA
    // ---------------------------------------------------------------------

    /// @dev Validación manual de firma EOA: longitud 65, v 27/28, low-s y
    ///      signer recuperado igual al esperado (y no cero).
    function _recoverSigner(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) {
            revert InvalidSignature();
        }
        bytes32 r;
        bytes32 s;
        uint8 v;
        // Carga r, s, v directamente desde calldata, sin escribir memoria.
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v != 27 && v != 28) {
            revert InvalidSignature();
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSignature();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) {
            revert InvalidSignature();
        }
        return signer;
    }

    function _verifyGrant(
        bytes32 consentId,
        address user,
        address professional,
        bytes32 packageHash,
        bytes32 scope,
        uint40 expiresAt,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) private view {
        if (nonce != nonces[user]) {
            revert InvalidNonce();
        }
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(
                    abi.encode(
                        _GRANT_TYPEHASH, consentId, user, professional, packageHash, scope, expiresAt, nonce, deadline
                    )
                )
            )
        );
        if (_recoverSigner(digest, signature) != user) {
            revert InvalidSignature();
        }
    }

    function _verifyRevoke(bytes32 consentId, address user, uint256 nonce, uint256 deadline, bytes calldata signature)
        private
        view
    {
        if (nonce != nonces[user]) {
            revert InvalidNonce();
        }
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(abi.encode(_REVOKE_TYPEHASH, consentId, user, nonce, deadline))
            )
        );
        if (_recoverSigner(digest, signature) != user) {
            revert InvalidSignature();
        }
    }
}
