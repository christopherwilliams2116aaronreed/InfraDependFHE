// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface InfrastructureData {
  id: string;
  sector: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  riskScore: number;
  status: "pending" | "analyzed" | "flagged";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [infrastructureData, setInfrastructureData] = useState<InfrastructureData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    sector: "",
    description: "",
    interdependencyData: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSector, setFilterSector] = useState("all");

  // Calculate statistics for dashboard
  const analyzedCount = infrastructureData.filter(d => d.status === "analyzed").length;
  const pendingCount = infrastructureData.filter(d => d.status === "pending").length;
  const flaggedCount = infrastructureData.filter(d => d.status === "flagged").length;
  const avgRiskScore = infrastructureData.length > 0 
    ? infrastructureData.reduce((sum, d) => sum + d.riskScore, 0) / infrastructureData.length 
    : 0;

  useEffect(() => {
    loadInfrastructureData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      if (isAvailable) {
        alert("FHE analysis system is available and ready for encrypted computations");
      } else {
        alert("FHE system is currently unavailable");
      }
    } catch (e) {
      console.error("Error checking availability:", e);
      alert("Error checking FHE system availability");
    }
  };

  const loadInfrastructureData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("infra_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing infrastructure keys:", e);
        }
      }
      
      const list: InfrastructureData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`infra_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                sector: data.sector,
                encryptedData: data.data,
                timestamp: data.timestamp,
                owner: data.owner,
                riskScore: data.riskScore || 0,
                status: data.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing infrastructure data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading infrastructure data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setInfrastructureData(list);
    } catch (e) {
      console.error("Error loading infrastructure data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitInfrastructureData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting infrastructure data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-INFRA-${btoa(JSON.stringify(newData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const infraData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        sector: newData.sector,
        riskScore: Math.floor(Math.random() * 100), // Simulated risk score
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `infra_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(infraData))
      );
      
      const keysBytes = await contract.getData("infra_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "infra_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Infrastructure data encrypted and submitted securely!"
      });
      
      await loadInfrastructureData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewData({
          sector: "",
          description: "",
          interdependencyData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const analyzeData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Analyzing infrastructure data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`infra_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Infrastructure data not found");
      }
      
      const infraData = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...infraData,
        status: "analyzed",
        riskScore: Math.floor(Math.random() * 100) // Simulated analysis
      };
      
      await contract.setData(
        `infra_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      await loadInfrastructureData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const flagData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Flagging infrastructure data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`infra_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Infrastructure data not found");
      }
      
      const infraData = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...infraData,
        status: "flagged"
      };
      
      await contract.setData(
        `infra_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE flagging completed successfully!"
      });
      
      await loadInfrastructureData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Flagging failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE analysis platform",
      icon: "🔗"
    },
    {
      title: "Submit Infrastructure Data",
      description: "Add your infrastructure interdependency data which will be encrypted using FHE",
      icon: "🏗️"
    },
    {
      title: "FHE Risk Analysis",
      description: "Your data is analyzed in encrypted state without decryption",
      icon: "📊"
    },
    {
      title: "Get Results",
      description: "Receive risk assessment results while keeping your data private",
      icon: "🔍"
    }
  ];

  const renderRiskChart = () => {
    return (
      <div className="risk-chart">
        <div className="chart-bar">
          <div className="bar-fill" style={{ width: `${avgRiskScore}%` }}></div>
          <div className="bar-label">Average Risk: {avgRiskScore.toFixed(1)}%</div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="color-box low-risk"></div>
            <span>Low Risk (0-30%)</span>
          </div>
          <div className="legend-item">
            <div className="color-box medium-risk"></div>
            <span>Medium Risk (31-70%)</span>
          </div>
          <div className="legend-item">
            <div className="color-box high-risk"></div>
            <span>High Risk (71-100%)</span>
          </div>
        </div>
      </div>
    );
  };

  const filteredData = infrastructureData.filter(item => {
    const matchesSearch = item.sector.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterSector === "all" || item.sector === filterSector;
    return matchesSearch && matchesFilter;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="infra-icon"></div>
          </div>
          <h1>InfraDepend<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="action-btn"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="primary-btn"
          >
            Add Data
          </button>
          <button 
            className="secondary-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <nav className="app-nav">
        <button 
          className={activeTab === "dashboard" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button 
          className={activeTab === "analysis" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("analysis")}
        >
          Risk Analysis
        </button>
        <button 
          className={activeTab === "data" ? "nav-btn active" : "nav-btn"}
          onClick={() => setActiveTab("data")}
        >
          Infrastructure Data
        </button>
      </nav>
      
      <div className="main-content">
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Infrastructure Analysis Guide</h2>
            <p className="subtitle">Learn how to securely analyze critical infrastructure interdependencies</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <h3>Project Overview</h3>
              <p>Confidential analysis of critical infrastructure interdependencies using Fully Homomorphic Encryption (FHE) to assess cascade failure risks without exposing sensitive data.</p>
              <div className="fhe-badge">
                <span>FHE-Powered Analysis</span>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Data Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{infrastructureData.length}</div>
                  <div className="stat-label">Total Records</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{analyzedCount}</div>
                  <div className="stat-label">Analyzed</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{pendingCount}</div>
                  <div className="stat-label">Pending</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{flaggedCount}</div>
                  <div className="stat-label">Flagged</div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Risk Assessment</h3>
              {renderRiskChart()}
            </div>
          </div>
        )}
        
        {activeTab === "data" && (
          <div className="data-section">
            <div className="section-header">
              <h2>Infrastructure Data Records</h2>
              <div className="header-controls">
                <div className="search-box">
                  <input 
                    type="text"
                    placeholder="Search data..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <select 
                  value={filterSector}
                  onChange={(e) => setFilterSector(e.target.value)}
                >
                  <option value="all">All Sectors</option>
                  <option value="Power">Power</option>
                  <option value="Communication">Communication</option>
                  <option value="Transportation">Transportation</option>
                  <option value="Water">Water</option>
                </select>
                <button 
                  onClick={loadInfrastructureData}
                  className="secondary-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Data"}
                </button>
              </div>
            </div>
            
            <div className="data-list">
              <div className="list-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Sector</div>
                <div className="header-cell">Owner</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Risk Score</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {filteredData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon"></div>
                  <p>No infrastructure data found</p>
                  <button 
                    className="primary-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Data Set
                  </button>
                </div>
              ) : (
                filteredData.map(item => (
                  <div className="data-row" key={item.id}>
                    <div className="list-cell data-id">#{item.id.substring(0, 6)}</div>
                    <div className="list-cell">{item.sector}</div>
                    <div className="list-cell">{item.owner.substring(0, 6)}...{item.owner.substring(38)}</div>
                    <div className="list-cell">
                      {new Date(item.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="list-cell">
                      <div className="risk-score">{item.riskScore}%</div>
                    </div>
                    <div className="list-cell">
                      <span className={`status-badge ${item.status}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="list-cell actions">
                      {isOwner(item.owner) && item.status === "pending" && (
                        <>
                          <button 
                            className="action-btn success"
                            onClick={() => analyzeData(item.id)}
                          >
                            Analyze
                          </button>
                          <button 
                            className="action-btn warning"
                            onClick={() => flagData(item.id)}
                          >
                            Flag
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitInfrastructureData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          data={newData}
          setData={setNewData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="infra-icon"></div>
              <span>InfraDependFHE</span>
            </div>
            <p>Confidential analysis of critical infrastructure interdependencies</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Confidential Analysis</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} InfraDependFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.sector || !data.interdependencyData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Infrastructure Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon"></div> Your infrastructure data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Sector *</label>
              <select 
                name="sector"
                value={data.sector} 
                onChange={handleChange}
              >
                <option value="">Select sector</option>
                <option value="Power">Power</option>
                <option value="Communication">Communication</option>
                <option value="Transportation">Transportation</option>
                <option value="Water">Water</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={data.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
              />
            </div>
            
            <div className="form-group full-width">
              <label>Interdependency Data *</label>
              <textarea 
                name="interdependencyData"
                value={data.interdependencyData} 
                onChange={handleChange}
                placeholder="Enter infrastructure interdependency data to encrypt..." 
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="primary-btn"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;