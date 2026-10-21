// scripts/install/index.js
// Main installer orchestration for plugin and per-skill installation modes.

const fs = require("fs");
const path = require("path");
const { parseArgs, mergeWithConfig, renderHelp } = require("./args");
const { resolveTargets } = require("./targets");
const {
  readPluginMetadata,
  buildSkillIndex,
  resolveRequestedSkills,
  resolveCommandsForSkills,
} = require("./manifests");
const { copyPaths } = require("./sync");

async function runInstallerCli(argv) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    console.log(renderHelp());
    return;
  }

  const config = parsed.configPath ? readConfig(parsed.configPath) : null;
  const args = mergeWithConfig(parsed, config);

  const repoRoot = path.resolve(__dirname, "..", "..");
  const targets = resolveTargets(args);
  const pluginMetadata = readPluginMetadata(repoRoot);

  if (args.mode === "plugin") {
    installPluginMode({ repoRoot, args, targets, pluginMetadata });
    return;
  }

  installSkillsMode({ repoRoot, args, targets, pluginMetadata });
}

function installPluginMode({ repoRoot, args, targets, pluginMetadata }) {
  const targetReports = [];

  for (const target of targets.pluginTargets) {
    const manifest = target.host === "cursor" ? pluginMetadata.cursor : pluginMetadata.claude;
    // mod/ is the Pass, a Claude Code hooks module that hooks/hooks.json names under
    // "modules"; Cursor reads only that file's "hooks" key, so its copy omits mod/.
    const sourcePaths = [
      target.manifestDir,
      "skills",
      "commands",
      "mcp",
      "hooks",
      ...(target.host === "claude" ? ["mod"] : []),
      "assets/brand",
      "docs/architecture.md",
      "docs/agents.md",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
    ].filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));

    const report = copyPaths(repoRoot, sourcePaths, target.installDir, { dryRun: args.dryRun });
    targetReports.push({
      host: target.host,
      installDir: target.installDir,
      name: manifest.name,
      version: manifest.version,
      report,
    });
  }

  printPluginSummary(targetReports, args.dryRun);
}

function installSkillsMode({ repoRoot, args, targets }) {
  const skillIndex = buildSkillIndex(repoRoot);
  const selectedSkills = resolveRequestedSkills(args.skills, skillIndex);
  const commandPaths = resolveCommandsForSkills(repoRoot, selectedSkills);

  const sourcePaths = [...selectedSkills, ...commandPaths];
  const report = copyPaths(repoRoot, sourcePaths, targets.skillsTarget.rootDir, {
    dryRun: args.dryRun,
  });

  printSkillsSummary({
    destination: targets.skillsTarget.rootDir,
    selectedSkills,
    commandPaths,
    report,
    dryRun: args.dryRun,
  });
}

function printPluginSummary(targetReports, dryRun) {
  const mode = dryRun ? "DRY RUN" : "APPLIED";
  console.log(`[bytheslice] Plugin install ${mode}`);
  for (const targetReport of targetReports) {
    console.log(
      `  - ${targetReport.host}: ${targetReport.name}@${targetReport.version} -> ${targetReport.installDir}`,
    );
    printReportStats(targetReport.report);
  }
}

function printSkillsSummary({ destination, selectedSkills, commandPaths, report, dryRun }) {
  const mode = dryRun ? "DRY RUN" : "APPLIED";
  console.log(`[bytheslice] Skills install ${mode}`);
  console.log(`  - destination: ${destination}`);
  console.log(`  - skills: ${selectedSkills.map((skill) => skill.replace(/^skills\//, "")).join(", ")}`);
  console.log(`  - command shims: ${commandPaths.length}`);
  printReportStats(report);
}

function printReportStats(report) {
  console.log(`    created: ${report.copied.length}`);
  console.log(`    updated: ${report.updated.length}`);
  console.log(`    unchanged: ${report.skipped.length}`);
}

function readConfig(configPath) {
  const absolutePath = path.resolve(process.cwd(), configPath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const json = stripJsonComments(raw);
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid config JSON at "${absolutePath}": ${error.message}`);
  }
}

function stripJsonComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/g, "").replace(/\s+\/\/.*$/g, ""))
    .join("\n");
}

module.exports = {
  runInstallerCli,
};
