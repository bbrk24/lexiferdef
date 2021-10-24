"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const phonemeClassType = 'class';
const macroType = 'macro';
const categoryType = 'enumMember';
const tokenTypes = [phonemeClassType, macroType, categoryType];
const tokenModifiers = ['declaration', 'definition'];
const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
class GroupNames {
    constructor() {
        this.classNames = new Set();
        this.macroNames = new Set();
        this.categoryNames = new Set();
    }
}
class Token {
    constructor(lineNumber, firstChar, length, type, modifiers) {
        this.type = type;
        this.modifiers = modifiers;
        this.range = new vscode.Range(new vscode.Position(lineNumber, firstChar), new vscode.Position(lineNumber, firstChar + length));
    }
}
class Provider {
    constructor() {
        this.groupNames = new GroupNames();
    }
    provideDocumentSemanticTokens(document) {
        const tokenBuilder = new vscode.SemanticTokensBuilder(legend);
        const docText = document.getText();
        this.getGroups(docText);
        const tokens = this.findRanges(docText);
        tokens.forEach(el => tokenBuilder.push(el.range, el.type, el.modifiers));
        return tokenBuilder.build();
    }
    getGroups(docText) {
        const lines = docText.split('\n');
        this.groupNames = new GroupNames();
        for (let line of lines) {
            // remove any comments or excess whitespace
            line = line.split('#')[0].trim();
            if (line.startsWith('categories:')) {
                // parse out category names
                let cats = line.substring(11).split(/\s+/gu);
                // remove any weights provided and add them to the set
                cats.forEach(el => this.groupNames.categoryNames.add(el.split(':')[0]));
            }
            else if (line.includes('=')) {
                // determine whether it's a class or a macro
                const name = line.split('=')[0].trimEnd();
                if (name[0] === '$') {
                    // it's a macro
                    this.groupNames.macroNames.add(name);
                }
                else if (name.length === 1) {
                    // it's a class
                    this.groupNames.classNames.add(name);
                }
                // otherwise it's either a category or a mistake
            }
        }
    }
    findRanges(docText) {
        const lines = docText.split('\n');
        const retVal = [];
        for (let i = 0; i < lines.length; ++i) {
            const origLine = lines[i];
            const trimmedLine = origLine.split('#')[0].trim();
            if (trimmedLine === '') {
                continue;
            }
            if (trimmedLine.includes('=')) {
                // this line is a definition
                if (trimmedLine[0] === '$') {
                    // macro declaration and definition, specifically
                    // it may also contain references to phoneme classes
                    const startIndex = origLine.indexOf('$');
                    // figure out which macro it is
                    let currMacro = '';
                    for (const macroName of this.groupNames.macroNames) {
                        if (trimmedLine.startsWith(macroName)) {
                            currMacro = macroName;
                            break;
                        }
                    }
                    retVal.push(new Token(i, startIndex, currMacro.length, macroType, ['declaration', 'definition']));
                    for (let j = trimmedLine.indexOf('=') + 1; j < trimmedLine.length; ++j) {
                        if (this.groupNames.classNames.has(trimmedLine[j])) {
                            retVal.push(new Token(i, startIndex + j, 1, phonemeClassType, []));
                        }
                    }
                }
                else {
                    // could be a category or class definition, or a mistake
                    const itemName = trimmedLine.split(/\s|=/u)[0];
                    if (itemName.length === 1) {
                        // it's a class name
                        retVal.push(new Token(i, origLine.indexOf(itemName), 1, phonemeClassType, ['declaration', 'definition']));
                    }
                    else if (this.groupNames.categoryNames.has(itemName)) {
                        // add one token for the category name, and then parse out any others it may reference
                        retVal.push(new Token(i, origLine.indexOf(itemName), itemName.length, categoryType, ['definition']), ...this.tokensForWordShape(origLine, i, origLine.indexOf('=')));
                    }
                    // else, it's not recognized, just ignore it
                }
            }
            else if (trimmedLine.startsWith('categories:')) {
                // category declarations but not definitions
                const startIndex = origLine.indexOf('categories:');
                for (const catName of this.groupNames.categoryNames) {
                    const catNameIndex = trimmedLine.indexOf(catName, 11);
                    if (catNameIndex !== -1) {
                        retVal.push(new Token(i, catNameIndex + startIndex, catName.length, categoryType, ['declaration']));
                    }
                }
            }
            else if (trimmedLine.startsWith('words:')) {
                // word shape definitions, may reference classes and macros
                retVal.push(...this.tokensForWordShape(origLine, i, origLine.indexOf(':')));
            }
        }
        return retVal;
    }
    tokensForWordShape(line, lineNumber, startIndex) {
        // remove the possibility of misparsing a comment
        line = line.split('#')[0];
        const retVal = [];
        for (let j = startIndex; j < line.length; ++j) {
            // look for class and macro references
            if (this.groupNames.classNames.has(line[j])) {
                retVal.push(new Token(lineNumber, j, 1, phonemeClassType, []));
            }
            else if (line[j] === '$') {
                // check if it matches any known macros
                const lineStartingAtMacroReference = line.substring(j);
                for (const macroName of this.groupNames.macroNames) {
                    if (lineStartingAtMacroReference.startsWith(macroName)) {
                        // success!
                        retVal.push(new Token(lineNumber, j, macroName.length, macroType, []));
                        // skip forward so we don't accidentally overlap this with a class name
                        j += macroName.length - 1;
                        break;
                    }
                }
            }
        }
        return retVal;
    }
}
const provider = new Provider();
vscode.languages.registerDocumentSemanticTokensProvider({
    language: 'def',
    scheme: 'file'
}, provider, legend);
