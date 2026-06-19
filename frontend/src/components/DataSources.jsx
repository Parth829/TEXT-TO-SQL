import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Plus, CheckCircle } from 'lucide-react';

export default function DataSources() {
  const [sources, setSources] = useState([]);
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('snowflake');
  const [connStr, setConnStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/sources');
      setSources(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await axios.post('http://localhost:8000/api/sources', {
        name,
        source_type: sourceType,
        connection_string: connStr
      });
      setStatus({ type: 'success', text: `Successfully connected to ${name} and indexed metadata to ChromaDB!` });
      fetchSources();
      setName('');
      setConnStr('');
    } catch (err) {
      setStatus({ type: 'error', text: 'Connection failed. Please check credentials.' });
    }
    setLoading(false);
  };

  return (
    <div>
      <h1><Database className="inline-block mr-2" /> Data Source Connection Manager</h1>
      
      <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
        <h3>Add New Connection</h3>
        <form onSubmit={handleAddSource}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ flex: 1 }}>
              <div className="form-group">
                <label className="form-label">Connection Name</label>
                <input required className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Prod Snowflake" />
              </div>
              <div className="form-group">
                <label className="form-label">Source Type</label>
                <select className="form-input" value={sourceType} onChange={e=>setSourceType(e.target.value)}>
                  <option value="snowflake">Snowflake</option>
                  <option value="bigquery">BigQuery</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="delta_lake">Delta Lake</option>
                </select>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="form-group">
                <label className="form-label">Connection String or Credentials URL</label>
                <input required type="password" className="form-input" value={connStr} onChange={e=>setConnStr(e.target.value)} />
              </div>
            </div>
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Connecting & Indexing...' : <><Plus size={18}/> Connect & Index Metadata</>}
          </button>
          
          {status && (
            <div style={{ marginTop: '16px', color: status.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
              {status.text}
            </div>
          )}
        </form>
      </div>

      <div style={{ marginTop: '32px' }}>
        <h3>Active Enterprise Connections</h3>
        {sources.length === 0 ? (
          <div className="glass-panel" style={{ padding: '16px' }}>
            No external sources connected. Defaulting to local PostgreSQL.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sources.map((s, idx) => (
              <div key={idx} className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid var(--success)' }}>
                <CheckCircle size={20} color="var(--success)" />
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>({s.type.toUpperCase()})</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--success)' }}>Indexed & Active</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
