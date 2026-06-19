import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

const extractData = (dataset, xCol, yCol, chartType) => {
  if (!dataset || dataset.length === 0) return { labels: [], values: [] };

  // Auto-detect xCol if missing or invalid
  const keys = Object.keys(dataset[0]);
  if (!xCol || !keys.includes(xCol)) {
    xCol = keys.find(k => k !== yCol && isNaN(dataset[0][k])) || keys.find(k => k !== yCol) || keys[0];
  }

  // Aggregate data by xCol to handle raw, unaggregated SQL results safely
  const aggregated = {};
  dataset.forEach(row => {
    const label = String(row[xCol] || 'Unknown');
    const val = parseFloat(row[yCol]) || 0;
    aggregated[label] = (aggregated[label] || 0) + val;
  });

  let entries = Object.entries(aggregated).map(([label, value]) => ({ label, value }));

  // Limit rendering points to prevent UI clutter
  if (chartType === 'line') {
    // Sort lines chronologically/alphabetically
    entries.sort((a, b) => a.label.localeCompare(b.label));
    if (entries.length > 50) entries = entries.slice(0, 50);
  } else {
    // Sort bar and pie by descending value
    entries.sort((a, b) => b.value - a.value);
    const limit = chartType === 'pie' ? 10 : 25;
    if (entries.length > limit) entries = entries.slice(0, limit);
  }

  return {
    labels: entries.map(e => e.label),
    values: entries.map(e => e.value)
  };
};

export default function DashboardRenderer({ dashboard, dataResults, forecast }) {
  if (!dashboard && !forecast) return null;

  return (
    <div style={{ marginTop: '32px' }}>
      {dashboard && (
        <>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {dashboard.title}
          </h2>
          
          <div className="dashboard-grid">
            {dashboard.charts.map(chart => {
          const { labels, values } = extractData(dataResults, chart.data_source_col_x, chart.data_source_col_y, chart.type);
          
          const pieColors = [
            'rgba(59, 130, 246, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(14, 165, 233, 0.8)'
          ];
          const pieBorderColors = [
            '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9'
          ];

          const bgColors = chart.type === 'pie' 
            ? labels.map((_, i) => pieColors[i % pieColors.length])
            : 'rgba(59, 130, 246, 0.5)';
            
          const borderColors = chart.type === 'pie'
            ? labels.map((_, i) => pieBorderColors[i % pieBorderColors.length])
            : '#3b82f6';

          const chartData = {
            labels,
            datasets: [
              {
                label: chart.title,
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 2,
                fill: true,
                tension: 0.4
              }
            ]
          };

          const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                display: chart.type === 'pie',
                position: 'right',
                labels: { color: 'rgba(255,255,255,0.7)' }
              },
              title: { display: false }
            },
            scales: chart.type === 'pie' ? {} : {
              x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
              y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
          };

          let metricValue = 'N/A';
          let metricSubtitle = 'Value';
          if (values.length > 0) {
            const titleLower = chart.title.toLowerCase();
            if (titleLower.includes('top') || titleLower.includes('highest') || titleLower.includes('max') || titleLower.includes('best')) {
              const maxVal = Math.max(...values);
              const maxIndex = values.indexOf(maxVal);
              metricValue = maxVal.toLocaleString();
              metricSubtitle = labels[maxIndex] || 'Maximum';
            } else if (titleLower.includes('average') || titleLower.includes('avg')) {
              metricValue = (values.reduce((a,b) => a+b, 0) / values.length).toLocaleString(undefined, {maximumFractionDigits: 1});
              metricSubtitle = 'Average';
            } else if (titleLower.includes('latest') || titleLower.includes('current')) {
              metricValue = values[values.length - 1].toLocaleString();
              metricSubtitle = labels[labels.length - 1] || 'Latest Value';
            } else {
              metricValue = values.reduce((a, b) => a + b, 0).toLocaleString();
              metricSubtitle = 'Total';
            }
          }

          let displayTitle = chart.title;
          const topMatch = displayTitle.match(/Top\s+(\d+)/i);
          if (topMatch && labels.length > 0 && parseInt(topMatch[1], 10) !== labels.length) {
            displayTitle = displayTitle.replace(new RegExp(`Top\\s+${topMatch[1]}`, 'i'), `Top ${labels.length}`);
          }

          return (
            <div key={chart.id} className="glass-panel" style={{ padding: '20px' }}>
              <h4 style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>{displayTitle}</h4>
              <div className="chart-container">
                {chart.type === 'line' && <Line data={chartData} options={options} />}
                {chart.type === 'bar' && <Bar data={chartData} options={options} />}
                {chart.type === 'pie' && <Pie data={chartData} options={options} />}
                {chart.type === 'metric' && (
                  <div className="metric-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="metric-value" style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{metricValue}</div>
                    <div style={{ color: 'var(--accent-primary)', fontSize: '1.1rem', marginTop: '8px', fontWeight: 500 }}>{metricSubtitle}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}

      {forecast && (
        <div className="glass-panel" style={{ padding: '20px', marginTop: '24px' }}>
          <h4 style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>Prophet Forecast</h4>
          <div className="chart-container">
            <Line 
              data={{
                labels: forecast.forecast_data.dates,
                datasets: [
                  {
                    label: 'Actual',
                    data: forecast.forecast_data.actual,
                    borderColor: '#10b981',
                    tension: 0.4
                  },
                  {
                    label: 'Forecast',
                    data: forecast.forecast_data.forecast,
                    borderColor: '#f59e0b',
                    borderDash: [5, 5],
                    tension: 0.4
                  }
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                  y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } }
                }
              }}
            />
          </div>
          <div style={{ marginTop: '16px', display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Expected Value</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{forecast.expected_value}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Confidence Interval</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{forecast.confidence_interval}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
