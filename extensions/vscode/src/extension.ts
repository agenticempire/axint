import * as path from "node:path";
import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const exec = promisify(execFile);
const AXINT_BINARY = process.platform === "win32" ? "npx.cmd" : "npx";
const AXINT_PACKAGE = "@axint/compiler";
const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

type AxintDiagnostic = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string | null;
  line?: number | null;
  suggestion?: string | null;
};

type AxintCompileResponse = {
  success: boolean;
  swift: string | null;
  outputPath: string | null;
  diagnostics: AxintDiagnostic[];
};

type AxintTemplate = {
  id: string;
  title: string;
  domain: string;
  description: string;
  source: string;
};

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Axint");
  const diagnostics = vscode.languages.createDiagnosticCollection("axint");

  const provider = vscode.lm.registerMcpServerDefinitionProvider("axint.mcpServer", {
    provideMcpServerDefinitions: async () => [
      new vscode.McpStdioServerDefinition("Axint", AXINT_BINARY, [
        "-y",
        AXINT_PACKAGE,
        "axint-mcp",
      ]),
    ],
  });

  async function resolveActiveSourceFile(): Promise<vscode.Uri | undefined> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== "file") {
      void vscode.window.showInformationMessage(
        "Open a TypeScript Axint source file to use Axint commands.",
      );
      return undefined;
    }

    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      void vscode.window.showWarningMessage(
        "Axint commands currently support .ts, .tsx, .mts, and .cts source files.",
      );
      return undefined;
    }

    return uri;
  }

  function diagnosticsFor(uri: vscode.Uri, items: AxintDiagnostic[]): vscode.Diagnostic[] {
    return items
      .filter((item) => item.severity === "error" || item.severity === "warning")
      .map((item) => {
        const line = Math.max((item.line ?? 1) - 1, 0);
        const range = new vscode.Range(line, 0, line, 200);
        const diagnostic = new vscode.Diagnostic(
          range,
          `${item.code}: ${item.message}${item.suggestion ? `\n${item.suggestion}` : ""}`,
          item.severity === "error"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.code = item.code;
        diagnostic.source = "Axint";
        return diagnostic;
      });
  }

  async function runAxintJson(
    args: string[],
    cwd: string,
  ): Promise<{ parsed: AxintCompileResponse; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await exec(AXINT_BINARY, ["-y", AXINT_PACKAGE, ...args], {
        cwd,
        maxBuffer: 20 * 1024 * 1024,
      });
      return { parsed: JSON.parse(stdout) as AxintCompileResponse, stdout, stderr };
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string; stderr?: string };
      const stdout = execError.stdout ?? "";
      const stderr = execError.stderr ?? "";
      if (!stdout.trim()) {
        throw new Error(stderr || execError.message);
      }
      return { parsed: JSON.parse(stdout) as AxintCompileResponse, stdout, stderr };
    }
  }

  async function compileCurrentFile(previewSwift: boolean) {
    const uri = await resolveActiveSourceFile();
    if (!uri) return;

    await vscode.window.activeTextEditor?.document.save();
    const filePath = uri.fsPath;
    const cwd = path.dirname(filePath);

    output.appendLine(`$ ${AXINT_BINARY} -y ${AXINT_PACKAGE} compile "${filePath}" --json --stdout`);

    try {
      const { parsed, stderr } = await runAxintJson(
        ["compile", filePath, "--json", "--stdout"],
        cwd,
      );

      diagnostics.set(uri, diagnosticsFor(uri, parsed.diagnostics));

      if (stderr.trim()) {
        output.appendLine(stderr.trim());
      }

      if (!parsed.success || !parsed.swift) {
        const errorCount = parsed.diagnostics.filter((item) => item.severity === "error").length;
        output.appendLine(`Axint compile failed with ${errorCount} error(s).`);
        output.show(true);
        void vscode.window.showErrorMessage(
          `Axint compile failed with ${errorCount} error(s). See Problems or the Axint output channel.`,
        );
        return;
      }

      output.appendLine(`Compiled ${path.basename(filePath)} successfully.`);

      if (previewSwift) {
        const document = await vscode.workspace.openTextDocument({
          language: "swift",
          content: parsed.swift,
        });
        await vscode.window.showTextDocument(document, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });
      }

      void vscode.window.showInformationMessage(
        previewSwift
          ? `Axint compiled ${path.basename(filePath)} and opened a Swift preview.`
          : `Axint compiled ${path.basename(filePath)} successfully.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      output.show(true);
      void vscode.window.showErrorMessage(`Axint failed: ${message}`);
    }
  }

  async function showTemplates() {
    const workspaceDir =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    output.appendLine(`$ ${AXINT_BINARY} -y ${AXINT_PACKAGE} templates --json`);

    try {
      const { stdout, stderr } = await exec(
        AXINT_BINARY,
        ["-y", AXINT_PACKAGE, "templates", "--json"],
        {
          cwd: workspaceDir,
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      if (stderr.trim()) {
        output.appendLine(stderr.trim());
      }

      const templates = JSON.parse(stdout) as AxintTemplate[];
      const pick = await vscode.window.showQuickPick(
        templates.map((template) => ({
          label: template.title,
          description: template.domain,
          detail: template.description,
          template,
        })),
        {
          matchOnDescription: true,
          matchOnDetail: true,
          placeHolder: "Browse bundled Axint templates",
        },
      );

      if (!pick) return;

      const document = await vscode.workspace.openTextDocument({
        language: "typescript",
        content: pick.template.source,
      });
      await vscode.window.showTextDocument(document, {
        preview: true,
        viewColumn: vscode.ViewColumn.Beside,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      output.show(true);
      void vscode.window.showErrorMessage(`Unable to load Axint templates: ${message}`);
    }
  }

  const commands = [
    vscode.commands.registerCommand("axint.previewSwift", async () => {
      await compileCurrentFile(true);
    }),
    vscode.commands.registerCommand("axint.validateCurrentFile", async () => {
      await compileCurrentFile(false);
    }),
    vscode.commands.registerCommand("axint.showTemplates", async () => {
      await showTemplates();
    }),
    vscode.commands.registerCommand("axint.openRegistry", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://registry.axint.ai"));
    }),
    vscode.commands.registerCommand("axint.openDocs", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://docs.axint.ai"));
    }),
  ];

  context.subscriptions.push(provider, output, diagnostics, ...commands);
}

export function deactivate() {}
