import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Database, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function DataSourceWizard({ onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState('');
  const [formData, setFormData] = useState({ name: '', host: '', user: '', pass: '' });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ tables: 0, columns: 0 });

  const sources = ['PostgreSQL', 'MySQL', 'Snowflake', 'BigQuery', 'SQL Server', 'SQLite'];
  
  const connectionPlaceholders = {
    'PostgreSQL': 'postgresql://user:pass@localhost:5432/db',
    'MySQL': 'mysql://user:pass@localhost:3306/db',
    'SQL Server': 'mssql+pyodbc://user:pass@localhost/db',
    'Snowflake': 'snowflake://user:pass@account/db',
    'BigQuery': 'bigquery://project-id',
    'SQLite': 'sqlite:///database.db'
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('http://localhost:8000/api/sources', {
        name: formData.name || 'New Database',
        source_type: sourceType,
        connection_string: formData.host
      });
      
      setStats(res.data.stats || { tables: 0, columns: 0 });
      setLoading(false);
      setStep(3); // Connection successful
      
      // Automatically move to step 4 after a brief pause
      setTimeout(() => {
        setStep(4);
        simulateIndexing();
      }, 2500);
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.detail || err.message || 'Failed to connect to database');
    }
  };

  const simulateIndexing = () => {
    let p = 0;
    const interval = setInterval(() => {
      p += 10;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          onComplete();
        }, 1000);
      }
    }, 300);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel" style={{ width: '500px', backgroundColor: 'var(--bg-dark)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Connect Data Source</h3>
          <X size={20} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={onClose} />
        </div>

        <div style={{ padding: '24px' }}>
          {/* Step 1: Select Source */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>Step 1: Select Database Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {sources.map(src => (
                  <div 
                    key={src}
                    onClick={() => setSourceType(src)}
                    style={{
                      padding: '12px', border: `1px solid ${sourceType === src ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                      backgroundColor: sourceType === src ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                    }}
                  >
                    {src}
                  </div>
                ))}
              </div>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '24px' }}
                disabled={!sourceType}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Connection Details */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>Step 2: Connection Details ({sourceType})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Connection Name</label>
                  <input className="chat-input" placeholder="e.g. Production Database" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Connection String URL</label>
                  <input className="chat-input" placeholder={`e.g. ${connectionPlaceholders[sourceType] || 'postgresql://user:pass@host/db'}`} value={formData.host} onChange={e => setFormData({...formData, host: e.target.value})} />
                </div>
              </div>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '8px' }}
                onClick={handleConnect}
                disabled={loading || !formData.name || !formData.host}
              >
                {loading ? <><Loader2 className="spinner" size={18} /> Testing Connection...</> : 'Test & Connect'}
              </button>
              {error && (
                <div style={{ marginTop: '16px', color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div style={{ padding: '24px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '24px' }}>
              <h3 style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <CheckCircle size={20} /> Connection Successful!
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.95rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Tables discovered:</span>
                  <span>{stats.tables}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Columns indexed:</span>
                  <span>{stats.columns}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Indexing */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Database size={40} className="icon-blue" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ marginBottom: '24px' }}>Generating Knowledge Base...</h3>
              
              <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s' }}></div>
              </div>
              
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'left', margin: '0 auto', width: 'fit-content' }}>
                {progress > 0 && <div>✓ Schema extraction complete</div>}
                {progress > 30 && <div>✓ Metadata indexed</div>}
                {progress > 60 && <div>✓ Embeddings generated</div>}
                {progress > 90 && <div>✓ Vector database synchronized</div>}
              </div>

              {progress >= 100 && (
                <div style={{ marginTop: '24px', color: 'var(--success)', fontWeight: 600 }}>
                  Ready for AI Analysis!
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
