'use client';

import React, { useState } from 'react';

const PRESETS: Record<string, { method: string; url: string; body: string }> = {
  health: {
    method: 'GET',
    url: '/api/health',
    body: ''
  },
  network: {
    method: 'GET',
    url: '/api/network',
    body: ''
  },
  simulate_g1: {
    method: 'POST',
    url: '/api/simulate',
    body: JSON.stringify(
      {
        closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
        config: { arrivalPolicy: 'AIRBORNE_HOLD' }
      },
      null,
      2
    )
  },
  simulate_g2: {
    method: 'POST',
    url: '/api/simulate',
    body: JSON.stringify(
      {
        closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
        actions: [{ type: 'SWAP_SPARE', flightId: 'DS0603', spareTail: 'VT-DS17' }]
      },
      null,
      2
    )
  },
  recommend: {
    method: 'POST',
    url: '/api/recommend',
    body: JSON.stringify(
      {
        closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
        maxActions: 2
      },
      null,
      2
    )
  },
  dispatch: {
    method: 'POST',
    url: '/api/dispatch',
    body: JSON.stringify(
      {
        closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
        provider: 'mock'
      },
      null,
      2
    )
  },
  vulnerability: {
    method: 'POST',
    url: '/api/vulnerability',
    body: JSON.stringify(
      {
        durations: [60],
        stepMin: 60,
        windowStart: 360,
        windowEnd: 600
      },
      null,
      2
    )
  }
};

export default function DebugPage() {
  const [selectedPreset, setSelectedPreset] = useState('simulate_g1');
  const [method, setMethod] = useState(PRESETS.simulate_g1.method);
  const [url, setUrl] = useState(PRESETS.simulate_g1.url);
  const [requestBody, setRequestBody] = useState(PRESETS.simulate_g1.body);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [responseJson, setResponseJson] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const p = PRESETS[presetKey];
    if (p) {
      setMethod(p.method);
      setUrl(p.url);
      setRequestBody(p.body);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponseStatus(null);
    setResponseJson('');

    const start = performance.now();
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      if (method === 'POST' && requestBody.trim()) {
        options.body = requestBody;
      }

      const res = await fetch(url, options);
      const end = performance.now();
      setResponseStatus(res.status);
      setResponseDuration(Math.round(end - start));

      const data = await res.json();
      setResponseJson(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      setResponseStatus(0);
      setResponseJson(JSON.stringify({ error: (err as Error).message }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Domino Sky — Debug Console</h1>
      <p>Bare-bones testbed for verifying REST API endpoints and inspecting raw JSON responses.</p>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ marginRight: '10px' }}>Load Preset:</label>
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          style={{ padding: '6px', background: '#1a1a24', color: '#fff', border: '1px solid #444' }}
        >
          <option value="simulate_g1">POST /api/simulate (G1 BLR Disruption)</option>
          <option value="simulate_g2">POST /api/simulate (G2 VT-DS17 Spare Swap)</option>
          <option value="recommend">POST /api/recommend (Optimizer Beam Search)</option>
          <option value="dispatch">POST /api/dispatch (AI Narrator)</option>
          <option value="vulnerability">POST /api/vulnerability (Sweep)</option>
          <option value="network">GET /api/network (Integrity & Slack)</option>
          <option value="health">GET /api/health</option>
        </select>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={{ padding: '8px', background: '#1a1a24', color: '#fff', border: '1px solid #444' }}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex: 1, padding: '8px', background: '#1a1a24', color: '#fff', border: '1px solid #444' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 20px',
              background: loading ? '#555' : '#1971c2',
              color: '#fff',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Executing...' : 'Submit Request'}
          </button>
        </div>

        {method === 'POST' && (
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>Request JSON Body:</label>
            <textarea
              rows={8}
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px',
                background: '#121218',
                color: '#8ce99a',
                border: '1px solid #333'
              }}
            />
          </div>
        )}
      </form>

      {responseStatus !== null && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '8px' }}>
            <h2>Response</h2>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                background: responseStatus >= 200 && responseStatus < 300 ? '#2b8a3e' : '#c92a2a'
              }}
            >
              HTTP {responseStatus}
            </span>
            {responseDuration !== null && <span>Elapsed: {responseDuration} ms</span>}
          </div>

          <pre
            style={{
              background: '#121218',
              color: '#f8f9fa',
              padding: '15px',
              borderRadius: '4px',
              border: '1px solid #333',
              overflowX: 'auto',
              maxHeight: '600px'
            }}
          >
            {responseJson}
          </pre>
        </div>
      )}
    </div>
  );
}
