import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import ChatWorkspace from './components/ChatWorkspace';
import ArtifactPanel from './components/ArtifactPanel';
import DataSourceWizard from './components/DataSourceWizard';
import SettingsModal from './components/SettingsModal';

const DataPreviewModal = ({ sourceName, onClose }) => {
  const [data, setData] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = `http://localhost:8000/api/preview?source_name=${encodeURIComponent(sourceName)}`;
        if (activeTable) {
            url += `&table_name=${encodeURIComponent(activeTable)}`;
        }
        const res = await axios.get(url);
        if (res.data.error) {
            setError(res.data.error);
        } else {
            setData(res.data.data || []);
            if (!activeTable && res.data.tables) {
                setTables(res.data.tables);
                setActiveTable(res.data.current_table);
            }
        }
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
      setLoading(false);
    };
    fetchData();
  }, [sourceName, activeTable]);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '1200px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Data Preview: {sourceName}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
        </div>
        
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar for Tables */}
          <div style={{ width: '250px', borderRight: '1px solid var(--border-color)', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '16px 0' }}>
            <div style={{ padding: '0 20px', marginBottom: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tables</div>
            {tables.map(t => (
              <div 
                key={t}
                className="nav-item"
                style={{ 
                  padding: '10px 20px', cursor: 'pointer', 
                  backgroundColor: activeTable === t ? 'rgba(59, 130, 246, 0.1)' : 'transparent', 
                  borderLeft: activeTable === t ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  wordBreak: 'break-all'
                }}
                onClick={() => setActiveTable(t)}
              >
                {t}
              </div>
            ))}
          </div>

          {/* Table Content */}
          <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--bg-dark)', padding: '24px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading data...</div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--danger)' }}>
                Error: {error}
              </div>
            ) : !Array.isArray(data) || data.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No data available in {activeTable}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    {Object.keys(data[0]).map(k => (
                      <th key={k} style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} style={{ transition: 'background-color 0.2s' }}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeArtifact, setActiveArtifact] = useState(null);
  const [dataSources, setDataSources] = useState([]);
  const [showWizard, setShowWizard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewSource, setPreviewSource] = useState(null);
  const [chatKey, setChatKey] = useState(0); // Used to force-remount ChatWorkspace on 'New Analysis'

  const [globalQuery, setGlobalQuery] = useState('');

  const fetchSources = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/sources');
      setDataSources(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to fetch data sources', e);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleNewAnalysis = () => {
    setActiveArtifact(null);
    setGlobalQuery('');
    setChatKey(prev => prev + 1);
  };

  const handleSourceClick = (sourceName) => {
    setPreviewSource(sourceName);
  };

  const handleDisconnectSource = async (sourceName) => {
    try {
      await axios.delete(`http://localhost:8000/api/sources/${encodeURIComponent(sourceName)}`);
      fetchSources();
    } catch (e) {
      console.error('Failed to disconnect source', e);
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* Sidebar - Fixed Width */}
      <div style={{ 
        width: sidebarOpen ? '280px' : '0px', 
        flexShrink: 0, 
        borderRight: sidebarOpen ? '1px solid var(--border-color)' : 'none', 
        backgroundColor: 'var(--bg-sidebar)',
        transition: 'width 0.3s ease',
        overflow: 'hidden'
      }}>
        <div style={{ width: '280px', height: '100%' }}>
          <Sidebar 
            onNewAnalysis={handleNewAnalysis} 
            onConnectSource={() => setShowWizard(true)} 
            dataSources={dataSources} 
            onSourceClick={handleSourceClick}
            onDisconnectSource={handleDisconnectSource}
            onSettingsClick={() => setShowSettings(true)}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      </div>
      
      {/* Middle Panel - Main Chat Workspace */}
      <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, position: 'relative', backgroundColor: 'var(--bg-dark)' }}>
        
        {/* Enterprise Top Navigation */}
        <header style={{
          height: '64px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          backgroundColor: 'rgba(7, 11, 20, 0.8)',
          backdropFilter: 'blur(12px)',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                style={{ 
                  background: 'transparent', border: '1px solid var(--border-color)', 
                  color: 'var(--text-primary)', borderRadius: '6px', padding: '6px', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            )}

            {dataSources.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--success)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)', boxShadow: '0 0 8px var(--success)' }}></div>
                Active Connection
              </div>
            )}
          </div>


        </header>

        <ChatWorkspace 
          key={chatKey} 
          setActiveArtifact={setActiveArtifact} 
          initialQuery={globalQuery} 
          hasDataSources={dataSources.length > 0}
          onConnectSource={() => setShowWizard(true)}
        />
      </main>

      {/* Right Panel - Artifacts (Claude Style) */}
      {activeArtifact && (
        <div style={{ 
          width: '450px', 
          flexShrink: 0, 
          borderLeft: '1px solid var(--border-color)', 
          backgroundColor: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
          animation: 'slideInRight 0.3s ease-out'
        }}>
          <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />
        </div>
      )}

      {/* Modals */}
      {showWizard && (
        <DataSourceWizard 
          onClose={() => setShowWizard(false)} 
          onComplete={() => {
            setShowWizard(false);
            fetchSources();
          }} 
        />
      )}
      
      {previewSource && (
        <DataPreviewModal sourceName={previewSource} onClose={() => setPreviewSource(null)} />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

    </div>
  );
}
