// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract InfrastructureAnalysisFHE is SepoliaConfig {
    struct EncryptedNetworkData {
        uint256 networkId;
        euint32 encryptedDependencyMatrix;  // Encrypted dependency relationships
        euint32 encryptedCapacity;          // Encrypted system capacity metrics
        euint32 encryptedCriticality;      // Encrypted criticality scores
        uint256 sector;                     // Infrastructure sector (1=Power, 2=Telecom, 3=Transport)
        uint256 timestamp;
    }

    struct EncryptedAnalysis {
        uint256 analysisId;
        euint32 encryptedRiskScore;       // Encrypted cascading failure risk
        euint32 encryptedVulnerability;   // Encrypted vulnerability index
        uint256 networkId;
        uint256 analyzedAt;
    }

    struct DecryptedResult {
        uint32 riskScore;
        uint32 vulnerability;
        bool isRevealed;
    }

    uint256 public networkCount;
    uint256 public analysisCount;
    mapping(uint256 => EncryptedNetworkData) public encryptedNetworks;
    mapping(uint256 => EncryptedAnalysis) public encryptedAnalyses;
    mapping(uint256 => DecryptedResult) public decryptedResults;
    
    mapping(uint256 => uint256) private requestToNetworkId;
    mapping(uint256 => uint256) private analysisRequestToId;
    
    event NetworkDataSubmitted(uint256 indexed networkId, uint256 sector, uint256 timestamp);
    event AnalysisRequested(uint256 indexed requestId, uint256 networkId);
    event AnalysisCompleted(uint256 indexed analysisId);
    event ResultDecrypted(uint256 indexed analysisId);

    modifier onlyAuthorized() {
        // Add proper authorization logic in production
        _;
    }

    function submitEncryptedNetworkData(
        euint32 encryptedDependencyMatrix,
        euint32 encryptedCapacity,
        euint32 encryptedCriticality,
        uint256 sector
    ) public onlyAuthorized {
        networkCount += 1;
        uint256 newNetworkId = networkCount;
        
        encryptedNetworks[newNetworkId] = EncryptedNetworkData({
            networkId: newNetworkId,
            encryptedDependencyMatrix: encryptedDependencyMatrix,
            encryptedCapacity: encryptedCapacity,
            encryptedCriticality: encryptedCriticality,
            sector: sector,
            timestamp: block.timestamp
        });
        
        emit NetworkDataSubmitted(newNetworkId, sector, block.timestamp);
    }

    function requestRiskAnalysis(uint256 networkId) public onlyAuthorized {
        EncryptedNetworkData storage network = encryptedNetworks[networkId];
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(network.encryptedDependencyMatrix);
        ciphertexts[1] = FHE.toBytes32(network.encryptedCapacity);
        ciphertexts[2] = FHE.toBytes32(network.encryptedCriticality);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.performAnalysis.selector);
        requestToNetworkId[reqId] = networkId;
        
        emit AnalysisRequested(reqId, networkId);
    }

    function performAnalysis(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 networkId = requestToNetworkId[requestId];
        require(networkId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 dependencies, uint32 capacity, uint32 criticality) = 
            abi.decode(cleartexts, (uint32, uint32, uint32));
        
        // Simulate FHE risk analysis (in production this would be done off-chain)
        analysisCount += 1;
        uint256 newAnalysisId = analysisCount;
        
        // Simplified risk calculation
        uint32 riskScore = calculateRiskScore(dependencies, capacity, criticality);
        uint32 vulnerability = calculateVulnerability(dependencies, capacity);
        
        encryptedAnalyses[newAnalysisId] = EncryptedAnalysis({
            analysisId: newAnalysisId,
            encryptedRiskScore: FHE.asEuint32(riskScore),
            encryptedVulnerability: FHE.asEuint32(vulnerability),
            networkId: networkId,
            analyzedAt: block.timestamp
        });
        
        decryptedResults[newAnalysisId] = DecryptedResult({
            riskScore: riskScore,
            vulnerability: vulnerability,
            isRevealed: false
        });
        
        emit AnalysisCompleted(newAnalysisId);
    }

    function requestResultDecryption(uint256 analysisId) public onlyAuthorized {
        EncryptedAnalysis storage analysis = encryptedAnalyses[analysisId];
        require(!decryptedResults[analysisId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(analysis.encryptedRiskScore);
        ciphertexts[1] = FHE.toBytes32(analysis.encryptedVulnerability);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAnalysis.selector);
        analysisRequestToId[reqId] = analysisId;
    }

    function decryptAnalysis(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 analysisId = analysisRequestToId[requestId];
        require(analysisId != 0, "Invalid request");
        
        DecryptedResult storage dResult = decryptedResults[analysisId];
        require(!dResult.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 riskScore, uint32 vulnerability) = abi.decode(cleartexts, (uint32, uint32));
        
        dResult.riskScore = riskScore;
        dResult.vulnerability = vulnerability;
        dResult.isRevealed = true;
        
        emit ResultDecrypted(analysisId);
    }

    function getDecryptedResult(uint256 analysisId) public view returns (
        uint32 riskScore,
        uint32 vulnerability,
        bool isRevealed
    ) {
        DecryptedResult storage r = decryptedResults[analysisId];
        return (r.riskScore, r.vulnerability, r.isRevealed);
    }

    function getEncryptedNetworkData(uint256 networkId) public view returns (
        euint32 dependencyMatrix,
        euint32 capacity,
        euint32 criticality,
        uint256 sector,
        uint256 timestamp
    ) {
        EncryptedNetworkData storage n = encryptedNetworks[networkId];
        return (n.encryptedDependencyMatrix, n.encryptedCapacity, n.encryptedCriticality, n.sector, n.timestamp);
    }

    function getEncryptedAnalysis(uint256 analysisId) public view returns (
        euint32 riskScore,
        euint32 vulnerability,
        uint256 networkId,
        uint256 analyzedAt
    ) {
        EncryptedAnalysis storage a = encryptedAnalyses[analysisId];
        return (a.encryptedRiskScore, a.encryptedVulnerability, a.networkId, a.analyzedAt);
    }

    // Helper functions for demo purposes
    function calculateRiskScore(uint32 dependencies, uint32 capacity, uint32 criticality) private pure returns (uint32) {
        // Simplified risk calculation
        return (dependencies * criticality) / (capacity > 0 ? capacity : 1);
    }

    function calculateVulnerability(uint32 dependencies, uint32 capacity) private pure returns (uint32) {
        // Simplified vulnerability calculation
        return (dependencies * 100) / (capacity > 0 ? capacity : 1);
    }
}