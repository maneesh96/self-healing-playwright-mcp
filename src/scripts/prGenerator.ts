import * as fs from 'fs';
import * as path from 'path';

interface TelemetryEvent {
  id: number;
  testName: string;
  originalSelector: string;
  healedSelector: string;
  confidence: number;
  reasoning: string;
  timestamp: string;
}

async function runPrGenerator() {
  const reportPath = path.join(process.cwd(), 'healing-report.json');
  if (!fs.existsSync(reportPath)) {
    console.error(`[PR Generator] Error: Healing report not found at ${reportPath}. Please run tests first.`);
    process.exit(1);
  }

  const events: TelemetryEvent[] = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (events.length === 0) {
    console.log('[PR Generator] No self-healing events found. Codebase is clean.');
    return;
  }

  console.log(`[PR Generator] Processing ${events.length} self-healing event(s)...`);

  // We scan src/pages and src/tests for references to original broken selectors
  const searchDirs = [
    path.join(process.cwd(), 'src', 'pages'),
    path.join(process.cwd(), 'src', 'tests')
  ];

  const filesToScan: string[] = [];
  function collectFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        filesToScan.push(fullPath);
      }
    }
  }

  searchDirs.forEach(collectFiles);

  const patches: { file: string; original: string; replacement: string; line: number }[] = [];

  for (const event of events) {
    const origSel = event.originalSelector;
    let healedSel = event.healedSelector;

    // Smart parsing: if healed locator is of form locator('...'), extract the raw selector string
    // because page objects expect clean selectors.
    const locatorMatch = healedSel.match(/^locator\(['"](.+)['"]\)$/);
    if (locatorMatch) {
      healedSel = locatorMatch[1];
    }

    let resolved = false;

    for (const file of filesToScan) {
      let content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match original selector in single quotes, double quotes, or backticks
        if (line.includes(`'${origSel}'`) || line.includes(`"${origSel}"`) || line.includes(`\`${origSel}\``)) {
          let quote = "'";
          if (line.includes(`"${origSel}"`)) quote = '"';
          else if (line.includes(`\`${origSel}\``)) quote = '`';

          const originalStr = `${quote}${origSel}${quote}`;
          const replacementStr = `${quote}${healedSel}${quote}`;
          
          patches.push({
            file,
            original: originalStr,
            replacement: replacementStr,
            line: i + 1
          });

          // Apply correction in-place
          lines[i] = line.replace(originalStr, replacementStr);
          resolved = true;
        }
      }

      if (resolved) {
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        console.log(`[PR Generator] Patched ${path.basename(file)} at line ${patches[patches.length - 1].line}`);
      }
    }

    if (!resolved) {
      console.warn(`[PR Generator] Warning: Could not find original locator string "${origSel}" in files.`);
    }
  }

  // Generate Git patch report
  if (patches.length > 0) {
    const branchName = `hotfix/heal-locators-${Date.now().toString().slice(-5)}`;
    console.log('\n======================================================');
    console.log('📦 AUTONOMOUS PULL REQUEST GENERATION COMPLETED');
    console.log('======================================================');
    console.log(`Proposed Branch Name: ${branchName}`);
    console.log('Created local file edits successfully. Review changes below:\n');

    patches.forEach(p => {
      console.log(`📌 File: ${path.relative(process.cwd(), p.file)}#L${p.line}`);
      console.log(`   - ${p.original}`);
      console.log(`   + ${p.replacement}\n`);
    });

    console.log('Commands to execute PR:');
    console.log(`   git checkout -b ${branchName}`);
    console.log('   git add .');
    console.log(`   git commit -m "refactor(tests): auto-heal stale selectors via MCP telemetry"`);
    console.log(`   git push origin ${branchName}`);
    console.log('======================================================\n');
  }
}

runPrGenerator().catch(err => {
  console.error('[PR Generator Error] Critical error during execution:', err);
  process.exit(1);
});
