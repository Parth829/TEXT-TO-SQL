import React, { useState } from 'react';
import { MessageSquare, Database, Settings, Plus, LayoutDashboard, ChevronDown, ChevronRight, Trash2, Menu, Search, LineChart, ShieldCheck, Clock, FileText, Zap } from 'lucide-react';

export default function Sidebar({ onNewAnalysis, onConnectSource, dataSources = [], onSourceClick, onSettingsClick, onDisconnectSource, toggleSidebar }) {
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [sourceToDelete, setSourceToDelete] = useState(null);

  const confirmDelete = () => {
    if (sourceToDelete && onDisconnectSource) {
      onDisconnectSource(sourceToDelete);
    }
    setSourceToDelete(null);
  };

  return (
    <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 16px', backgroundColor: 'var(--bg-sidebar)' }}>
      
      {/* Top Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', paddingLeft: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={16} color="white" />
            </div>
            <h2 className="display-font" style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
              Analytics Copilot
            </h2>
          </div>
          {toggleSidebar && (
            <button onClick={toggleSidebar} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Menu size={20} />
            </button>
          )}
        </div>
      </div>
      
      {/* Intelligent Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        



        {/* Data Sources Section */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, paddingLeft: '8px', marginBottom: '8px', letterSpacing: '0.05em' }}>DATA GOVERNANCE</div>
          <div 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 12px', borderRadius: '6px', color: 'var(--text-secondary)' }}
            className="nav-item"
            onClick={() => setSourcesOpen(!sourcesOpen)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', fontWeight: 500 }}>
              <Database size={16} />
              Connected Sources
            </div>
            {sourcesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          
          {sourcesOpen && (
            <div style={{ paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {dataSources.length > 0 ? (
                dataSources.map((ds, idx) => (
                  <div 
                    key={idx} 
                    className="nav-item"
                    style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }} onClick={() => onSourceClick && onSourceClick(ds.name)}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--success)', boxShadow: '0 0 6px var(--success)' }}></div>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{ds.name}</span>
                    </div>
                    <Trash2 
                      size={14} 
                      style={{ color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.5 }} 
                      onClick={(e) => { e.stopPropagation(); setSourceToDelete(ds.name); }}
                      onMouseOver={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = 1; }}
                      onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.opacity = 0.5; }}
                    />
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 12px' }}>No sources connected</div>
              )}
              
              <button 
                style={{ marginTop: '8px', fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
                onClick={onConnectSource}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
              >
                <Plus size={14} /> Add Connection
              </button>
            </div>
          )}
          
        </div>
      </div>
      


      {/* Delete Confirmation Modal */}
      {sourceToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ padding: '32px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Disconnect Data Source?</h3>
            <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>Are you sure you want to disconnect <strong>{sourceToDelete}</strong>?</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }} 
                onClick={() => setSourceToDelete(null)}
              >
                Cancel
              </button>
              <button 
                style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontWeight: 500 }} 
                onClick={confirmDelete}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
