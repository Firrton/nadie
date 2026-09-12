/**
 * ABI de ConsentRegistry, copiada desde packages/contracts/abi (fuente
 * reproducible con ./abi/regenerate.sh). Solo las funciones que el gateway lee.
 */
import abiJson from "./consent-abi.json";

interface AbiEntry {
  type: string;
  name?: string;
  inputs?: { name: string; type: string }[];
  outputs?: { name: string; type: string }[];
  stateMutability?: string;
}

export const ConsentRegistryAbi = (abiJson as readonly AbiEntry[]).filter(
  (entry) => entry.type === "function" && (entry.name === "consents" || entry.name === "isValid"),
);
