import * as vscode from 'vscode';
import { legend, SemanticProvider } from './SemanticProvider';
import FoldingProvider from './FoldingProvider';

const selector: vscode.DocumentSelector = { language: 'def' };
const semanticProvider = new SemanticProvider();
const foldingProvider = new FoldingProvider();

vscode.languages.registerDocumentSemanticTokensProvider(selector, semanticProvider, legend);
vscode.languages.registerDefinitionProvider(selector, semanticProvider);
vscode.languages.registerReferenceProvider(selector, semanticProvider);
vscode.languages.registerRenameProvider(selector, semanticProvider);
vscode.languages.registerDeclarationProvider(selector, semanticProvider);

vscode.languages.registerFoldingRangeProvider(selector, foldingProvider);
