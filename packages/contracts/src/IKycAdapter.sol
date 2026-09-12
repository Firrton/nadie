// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Interfaz mínima del adaptador KYC de HashKey (isHuman con nivel).
/// El contrato real de HashKey se adapta detrás de esta interfaz; en tests se
/// usa exclusivamente un mock.
interface IKycAdapter {
    /// @dev Devuelve true si `account` es un humano verificado con nivel >= `minimumLevel`.
    function isHuman(address account, uint256 minimumLevel) external view returns (bool);
}
