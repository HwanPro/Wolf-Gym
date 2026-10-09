import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Se requieren carpetas de origen y destino.');
const result = ts.transpileModule(fs.readFileSync(path.join(source, 'next.config.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
  throw new Error('La configuración de Next no se puede convertir a JavaScript.');
}
fs.writeFileSync(path.join(destination, 'next.config.mjs'), result.outputText);
