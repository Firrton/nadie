// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IKycAdapter} from "./IKycAdapter.sol";

/// @title ProfessionalRegistry
/// @notice Registro on-chain de credenciales de profesionales verificados.
/// @dev Nunca guarda datos personales: solo direcciones, llaves públicas de
///      cifrado, nombres visibles elegidos por el profesional, estados,
///      vencimientos y emisores.
contract ProfessionalRegistry {
    // ---------------------------------------------------------------------
    // Errores
    // ---------------------------------------------------------------------

    error NotAdmin();
    error NotAuthorizedVerifier();
    error ZeroAddress();
    error ZeroKey();
    error EmptyName();
    error InvalidExpiry();
    error ExpiryNotExtension();
    error AlreadyIssued();
    error AlreadySuspended();
    error CredentialNotFound();
    error KeyNotRegistered();
    error KeyAlreadyRegistered();

    // ---------------------------------------------------------------------
    // Tipos y almacenamiento
    // ---------------------------------------------------------------------

    enum Status {
        None,
        Active,
        Suspended
    }

    struct Credential {
        bytes32 publicKey;
        string displayName;
        Status status;
        uint40 expiresAt;
        address issuer;
    }

    address public immutable admin;
    IKycAdapter public kycAdapter;
    uint256 public kycMinimumLevel;

    mapping(address => bool) public verifiers;
    /// @dev Llave registrada por el propio profesional antes de la emisión.
    mapping(address => bytes32) public registeredKeys;
    mapping(address => Credential) private _credentials;

    // ---------------------------------------------------------------------
    // Eventos
    // ---------------------------------------------------------------------

    event VerifierSet(address indexed verifier, bool enabled, address indexed admin);
    event KeyRegistered(address indexed professional, bytes32 key);
    event Issued(
        address indexed professional, bytes32 publicKey, string displayName, uint40 expiresAt, address indexed issuer
    );
    event Renewed(address indexed professional, uint40 expiresAt, address indexed verifier);
    event Suspended(address indexed professional, address indexed verifier);
    event KeyRotated(address indexed professional, bytes32 newKey);
    event KycAdapterSet(IKycAdapter indexed adapter, uint256 minimumLevel, address indexed admin);

    // ---------------------------------------------------------------------
    // Modificadores
    // ---------------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert NotAdmin();
        }
        _;
    }

    modifier onlyVerifier() {
        if (!verifiers[msg.sender]) {
            revert NotAuthorizedVerifier();
        }
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() {
        admin = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Administración de verificadores y KYC
    // ---------------------------------------------------------------------

    /// @notice Solo el administrador habilita o deshabilita verificadores.
    function setVerifier(address verifier, bool enabled) external onlyAdmin {
        if (verifier == address(0)) {
            revert ZeroAddress();
        }
        verifiers[verifier] = enabled;
        emit VerifierSet(verifier, enabled, admin);
    }

    /// @notice El administrador configura (o desactiva con address(0)) el adaptador KYC.
    /// @dev Al desactivar el adaptador, minimumLevel queda en cero.
    function setKycAdapter(IKycAdapter adapter, uint256 minimumLevel) external onlyAdmin {
        kycAdapter = adapter;
        if (adapter == IKycAdapter(address(0))) {
            kycMinimumLevel = 0;
        } else {
            kycMinimumLevel = minimumLevel;
        }
        emit KycAdapterSet(adapter, kycMinimumLevel, admin);
    }

    // ---------------------------------------------------------------------
    // Llave del profesional
    // ---------------------------------------------------------------------

    /// @notice El profesional registra su propia llave pública de cifrado.
    /// @dev Ejecutable por el propio msg.sender antes de la emisión. La llave
    ///      cero y los registros duplicados se rechazan.
    function registerKey(bytes32 key) external {
        if (key == bytes32(0)) {
            revert ZeroKey();
        }
        if (registeredKeys[msg.sender] != bytes32(0)) {
            revert KeyAlreadyRegistered();
        }
        registeredKeys[msg.sender] = key;
        emit KeyRegistered(msg.sender, key);
    }

    /// @notice El profesional rota únicamente su propia llave pública de cifrado.
    /// @dev Exige una llave previamente registrada. Antes de la emisión solo
    ///      actualiza registeredKeys; después de la emisión actualiza también
    ///      Credential.publicKey.
    function rotateKey(bytes32 newKey) external {
        if (newKey == bytes32(0)) {
            revert ZeroKey();
        }
        if (registeredKeys[msg.sender] == bytes32(0)) {
            revert KeyNotRegistered();
        }
        registeredKeys[msg.sender] = newKey;
        Credential storage credential = _credentials[msg.sender];
        if (credential.status != Status.None) {
            credential.publicKey = newKey;
        }
        emit KeyRotated(msg.sender, newKey);
    }

    // ---------------------------------------------------------------------
    // Credenciales
    // ---------------------------------------------------------------------

    /// @notice Un verificador autorizado emite una credencial usando la llave
    ///         que el profesional registró previamente. El verificador no elige
    ///         ni puede sustituir la llave. Segunda emisión se rechaza.
    function issue(address professional, string calldata displayName, uint40 expiresAt) external onlyVerifier {
        if (professional == address(0)) {
            revert ZeroAddress();
        }
        bytes32 publicKey = registeredKeys[professional];
        if (publicKey == bytes32(0)) {
            revert KeyNotRegistered();
        }
        if (bytes(displayName).length == 0) {
            revert EmptyName();
        }
        if (expiresAt <= block.timestamp) {
            revert InvalidExpiry();
        }
        if (_credentials[professional].status != Status.None) {
            revert AlreadyIssued();
        }

        _credentials[professional] = Credential(publicKey, displayName, Status.Active, expiresAt, msg.sender);
        emit Issued(professional, publicKey, displayName, expiresAt, msg.sender);
    }

    /// @notice Un verificador autorizado renueva (extiende) una credencial.
    /// @dev El nuevo vencimiento debe ser futuro Y mayor que el actual. Una
    ///      renovación NO reactiva una credencial suspendida.
    function renew(address professional, uint40 expiresAt) external onlyVerifier {
        Credential storage credential = _credentials[professional];
        if (credential.status == Status.None) {
            revert CredentialNotFound();
        }
        if (expiresAt <= block.timestamp) {
            revert InvalidExpiry();
        }
        if (expiresAt <= credential.expiresAt) {
            revert ExpiryNotExtension();
        }
        credential.expiresAt = expiresAt;
        emit Renewed(professional, expiresAt, msg.sender);
    }

    /// @notice Un verificador autorizado suspende una credencial activa.
    function suspend(address professional) external onlyVerifier {
        Credential storage credential = _credentials[professional];
        if (credential.status == Status.None) {
            revert CredentialNotFound();
        }
        if (credential.status == Status.Suspended) {
            revert AlreadySuspended();
        }
        credential.status = Status.Suspended;
        emit Suspended(professional, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Consultas
    // ---------------------------------------------------------------------

    /// @notice Devuelve la credencial de un profesional.
    function credentials(address professional)
        external
        view
        returns (bytes32 publicKey, string memory displayName, Status status, uint40 expiresAt, address issuer)
    {
        Credential storage credential = _credentials[professional];
        return
            (credential.publicKey, credential.displayName, credential.status, credential.expiresAt, credential.issuer);
    }

    /// @notice True solo si la credencial existe, está activa, no venció, tiene
    ///         llave válida y (si hay adaptador KYC) pasa isHuman con el nivel
    ///         mínimo. Un revert del adaptador se trata como false.
    function isVerified(address professional) public view returns (bool) {
        Credential storage credential = _credentials[professional];
        if (credential.status != Status.Active) {
            return false;
        }
        if (credential.expiresAt <= block.timestamp) {
            return false;
        }
        if (credential.publicKey == bytes32(0)) {
            return false;
        }
        IKycAdapter adapter = kycAdapter;
        if (adapter != IKycAdapter(address(0))) {
            try adapter.isHuman(professional, kycMinimumLevel) returns (bool human) {
                if (!human) {
                    return false;
                }
            } catch {
                return false;
            }
        }
        return true;
    }
}
