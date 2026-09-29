import { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { TelemetryStore, TelemetryEvent } from './telemetry';
import { HealingCache } from './cache';
import * as fs from 'fs';
import * as path from 'path';

class SelfHealingReporter implements Reporter {
  async onEnd(result: FullResult) {
    try {
      const events = await TelemetryStore.getEvents();
      
      // Write JSON report
      const jsonReportPath = path.join(process.cwd(), 'healing-report.json');
      fs.writeFileSync(jsonReportPath, JSON.stringify(events, null, 2));

      // Generate HTML report
      const htmlReportPath = path.join(process.cwd(), 'healing-dashboard.html');
      const htmlContent = this.generateHtmlReport(events, result);
      fs.writeFileSync(htmlReportPath, htmlContent);

      // Print Summary in Console
      this.printTerminalSummary(events, result);
      
      // Clean up DB connections
      await HealingCache.close();
    } catch (error) {
      console.error('[Reporter Error] Failed to generate reports:', error);
    }
  }

  private printTerminalSummary(events: TelemetryEvent[], result: FullResult) {
    console.log('\n======================================================');
    console.log('🤖 PLAYWRIGHT MCP SELF-HEALING AUTOMATION RUN COMPLETE');
    console.log(`⏱️  Status: ${result.status.toUpperCase()} | Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log('======================================================');

    if (events.length === 0) {
      console.log('✅ All locators resolved successfully without interventions.');
      console.log('======================================================\n');
      return;
    }

    console.log(`⚠️  Detected ${events.length} Self-Healing Event(s):`);
    events.forEach((event, index) => {
      console.log(`\n[#${index + 1}] Test: "${event.testName}"`);
      console.log(`   ❌ Original Selector: "${event.originalSelector}"`);
      console.log(`   ✨ Healed Locator   : "${event.healedSelector}"`);
      console.log(`   🎯 Confidence Score : ${(event.confidence * 100).toFixed(1)}%`);
      console.log(`   📝 Reasoning        : ${event.reasoning}`);
    });
    console.log('\n📊 Detailed reports generated:');
    console.log(`   - JSON: file://${path.join(process.cwd(), 'healing-report.json')}`);
    console.log(`   - HTML Dashboard: file://${path.join(process.cwd(), 'healing-dashboard.html')}`);
    console.log('======================================================\n');
  }

  private generateHtmlReport(events: TelemetryEvent[], result: FullResult): string {
    const totalRuns = events.length;
    const highConfidence = events.filter(e => e.confidence >= 0.8).length;
    const medConfidence = events.filter(e => e.confidence >= 0.5 && e.confidence < 0.8).length;
    
    // HTML structure with ultra-premium styling
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Self-Healing Test Telemetry Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0d0f12;
      --card-bg: rgba(22, 28, 36, 0.6);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary-color: #bb86fc;
      --secondary-color: #03dac6;
      --error-color: #cf6679;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --success-color: #4caf50;
      --warning-color: #ff9800;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      line-height: 1.6;
      padding: 40px 20px;
      background-image: 
        radial-gradient(at 10% 20%, rgba(187, 134, 252, 0.08) 0px, transparent 50%),
        radial-gradient(at 90% 80%, rgba(3, 218, 198, 0.08) 0px, transparent 50%);
      background-attachment: fixed;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 50px;
    }

    header h1 {
      font-size: 2.8rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
      letter-spacing: -0.5px;
    }

    header p {
      color: var(--text-muted);
      font-size: 1.1rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
      transition: transform 0.3s ease, border-color 0.3s ease;
    }

    .stat-card:hover {
      transform: translateY(-5px);
      border-color: rgba(187, 134, 252, 0.3);
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text-main);
      margin-top: 8px;
    }

    .stat-card.heals .stat-value {
      color: var(--primary-color);
    }

    .stat-card.passed .stat-value {
      color: var(--secondary-color);
    }

    .stat-label {
      font-size: 0.9rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .report-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 30px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .card-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card-title::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 24px;
      background: var(--primary-color);
      border-radius: 3px;
    }

    .no-events {
      text-align: center;
      padding: 40px 0;
      color: var(--text-muted);
      font-size: 1.2rem;
    }

    .event-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .event-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 20px;
      transition: background-color 0.2s ease;
    }

    .event-item:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 10px;
    }

    .test-name {
      font-size: 1.15rem;
      font-weight: 600;
      color: #fff;
    }

    .confidence-badge {
      font-size: 0.85rem;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 600;
    }

    .confidence-high {
      background: rgba(76, 175, 80, 0.15);
      color: var(--success-color);
      border: 1px solid rgba(76, 175, 80, 0.3);
    }

    .confidence-med {
      background: rgba(255, 152, 0, 0.15);
      color: var(--warning-color);
      border: 1px solid rgba(255, 152, 0, 0.3);
    }

    .locator-diff-box {
      background: #06080a;
      border-radius: 8px;
      padding: 15px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.95rem;
      margin-bottom: 12px;
      border-left: 4px solid var(--error-color);
    }

    .locator-line {
      display: flex;
      margin-bottom: 6px;
    }
    
    .locator-line:last-child {
      margin-bottom: 0;
    }

    .prefix-del {
      color: var(--error-color);
      margin-right: 10px;
      user-select: none;
    }

    .prefix-add {
      color: var(--secondary-color);
      margin-right: 10px;
      user-select: none;
    }

    .content-del {
      color: #ff8a80;
      text-decoration: line-through;
    }

    .content-add {
      color: var(--secondary-color);
      font-weight: bold;
    }

    .reasoning-box {
      font-size: 0.95rem;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.01);
      border-radius: 8px;
      padding: 12px 15px;
      border: 1px dashed rgba(255, 255, 255, 0.08);
    }

    .reasoning-box strong {
      color: var(--text-main);
    }

    .timestamp {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-align: right;
      margin-top: 8px;
    }

    @media(max-width: 768px) {
      .event-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .timestamp {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Model Context Protocol</h1>
      <p>Self-Healing Test Locator Telemetry Dashboard</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Run Status</div>
        <div class="stat-value" style="color: ${result.status === 'passed' ? 'var(--secondary-color)' : 'var(--error-color)'};">
          ${result.status.toUpperCase()}
        </div>
      </div>
      <div class="stat-card heals">
        <div class="stat-label">Locators Healed</div>
        <div class="stat-value">${totalRuns}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">High Confidence (>= 80%)</div>
        <div class="stat-value" style="color: var(--success-color);">${highConfidence}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Run Duration</div>
        <div class="stat-value">${(result.duration / 1000).toFixed(1)}s</div>
      </div>
    </div>

    <div class="report-card">
      <div class="card-title">Intervention Activity Log</div>
      
      ${totalRuns === 0 ? `
        <div class="no-events">
          ✨ Excellent. No test failures triggered locator self-healing.
        </div>
      ` : `
        <div class="event-list">
          ${events.map((event) => {
            const badgeClass = event.confidence >= 0.8 ? 'confidence-high' : 'confidence-med';
            const percentage = (event.confidence * 100).toFixed(0);
            
            return `
              <div class="event-item">
                <div class="event-header">
                  <div class="test-name">${escapeHtml(event.testName)}</div>
                  <div class="confidence-badge ${badgeClass}">Confidence: ${percentage}%</div>
                </div>

                <div class="locator-diff-box" style="border-left-color: ${event.confidence >= 0.8 ? 'var(--secondary-color)' : 'var(--warning-color)'};">
                  <div class="locator-line">
                    <span class="prefix-del">-</span>
                    <span class="content-del">${escapeHtml(event.originalSelector)}</span>
                  </div>
                  <div class="locator-line">
                    <span class="prefix-add">+</span>
                    <span class="content-add">page.${escapeHtml(event.healedSelector)}</span>
                  </div>
                </div>

                <div class="reasoning-box">
                  <strong>Healing Reason:</strong> ${escapeHtml(event.reasoning)}
                </div>
                
                <div class="timestamp">
                  Resolved At: ${new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  </div>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default SelfHealingReporter;
