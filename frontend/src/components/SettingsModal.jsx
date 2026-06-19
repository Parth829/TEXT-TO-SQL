import React, { useState } from 'react';
import { X, Save, Key, Cpu, Sliders } from 'lucide-react';

export default function SettingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    llmProvider: 'openai',
    apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    temperature: 0.2,
    maxTokens: 2048,
    theme: 'dark',
    enableStreaming: true
  });

  const handleSave = () => {
    // In a real app, save to localStorage or backend
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel" style={{ width: '600px', backgroundColor: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} /> Preferences
          </h3>
          <X size={20} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={onClose} />
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Sidebar */}
          <div style={{ width: '180px', borderRight: '1px solid var(--border-color)', padding: '16px 0', backgroundColor: 'rgba(0,0,0,0.2)' }}>
            <div 
              className={`nav-item ${activeTab === 'general' ? 'active' : ''}`}
              style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: activeTab === 'general' ? 'rgba(59, 130, 246, 0.1)' : 'transparent', borderLeft: activeTab === 'general' ? '3px solid var(--accent-primary)' : '3px solid transparent' }}
              onClick={() => setActiveTab('general')}
            >
              <Cpu size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} /> General
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Theme Preference</label>
                  <select className="chat-input" value={settings.theme} onChange={e => setSettings({...settings, theme: e.target.value})} style={{ width: '100%' }}>
                    <option value="dark">Dark Mode (Default)</option>
                    <option value="light">Light Mode</option>
                    <option value="system">System Default</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={settings.enableStreaming} onChange={e => setSettings({...settings, enableStreaming: e.target.checked})} />
                    Enable Streaming Agent UI
                  </label>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', paddingLeft: '22px' }}>
                    Show the real-time AI thought process and steps before displaying results.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleSave}>
            <Save size={16} /> Save Changes
          </button>
        </div>

      </div>
    </div>
  );
}
