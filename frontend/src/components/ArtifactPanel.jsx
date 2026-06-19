import React, { useState } from 'react';
import { X, Maximize2, Download, Table as TableIcon, BarChart2, Layers } from 'lucide-react';
import DashboardRenderer from './DashboardRenderer';

export default function ArtifactPanel({ artifact, onClose }) {
  const [activeTab, setActiveTab] = useState('chart');
  const [isMaximized, setIsMaximized] = useState(false);

  // artifact expects { dashboard, forecast, query_results }
  
  const hasChart = artifact.dashboard || artifact.forecast;
  const hasTable = artifact.query_results && artifact.query_results.length > 0;

  React.useEffect(() => {
    if (!hasChart && hasTable) {
      setActiveTab('table');
    } else if (hasChart) {
      setActiveTab('chart');
    }
  }, [artifact, hasChart, hasTable]);

  const handleDownload = () => {
    if (!artifact.query_results || artifact.query_results.length === 0) return;
    
    const headers = Object.keys(artifact.query_results[0]);
    const csvRows = [
      headers.join(','),
      ...artifact.query_results.map(row => 
        headers.map(header => {
          let val = row[header] === null ? '' : row[header];
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            val = `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',')
      )
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div style={isMaximized ? {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'var(--bg-dark)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    } : { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-panel)' }}>
      <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 10 }}>
        <button style={{ background: 'transparent', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsMaximized(!isMaximized)} title="Toggle Fullscreen">
          <Maximize2 size={16} />
        </button>
        <button style={{ background: 'transparent', border: 'none', padding: '6px', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose} title="Close Panel">
          <X size={20} />
        </button>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px', backgroundColor: 'var(--bg-dark)' }}>
        {activeTab === 'chart' ? (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <DashboardRenderer 
              dashboard={artifact.dashboard} 
              dataResults={artifact.query_results} 
              forecast={artifact.forecast} 
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            No visual data available
          </div>
        )}
      </div>
    </div>
  );
}
