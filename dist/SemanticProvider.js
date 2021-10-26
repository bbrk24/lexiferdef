"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SemanticProvider = exports.legend = void 0;
const vscode = require("vscode");
const phonemeClassType = 'class';
const macroType = 'macro';
const categoryType = 'enumMember';
const tokenTypes = [phonemeClassType, macroType, categoryType];
const tokenModifiers = ['declaration', 'definition', 'readonly'];
exports.legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
class GroupNames {
    constructor() {
        this.classNames = new Map();
        this.macroNames = new Map();
        this.categoryNames = new Map();
    }
}
class Token {
    constructor(lineNumber, firstChar, text, type, modifiers) {
        this.text = text;
        this.type = type;
        this.modifiers = modifiers;
        this.range = new vscode.Range(new vscode.Position(lineNumber, firstChar), new vscode.Position(lineNumber, firstChar + text.length));
    }
}
/** This class provides document-aware features, such as semantic highlighting and definition location. */
class SemanticProvider {
    constructor() {
        this.groupNames = new GroupNames();
        this.allTokens = [];
    }
    provideDocumentSemanticTokens(document, token) {
        const tokenBuilder = new vscode.SemanticTokensBuilder(exports.legend);
        this.getGroups(document);
        this.findRanges(document);
        this.allTokens.forEach(el => tokenBuilder.push(el.range, el.type, el.modifiers));
        return tokenBuilder.build();
    }
    provideDefinition(document, position, token) {
        var _a, _b, _c;
        // find the token
        const containingToken = this.findContainingToken(position);
        if (!containingToken) {
            return undefined;
        }
        // okay, we know what token it belongs to, now find its corresponding definition
        let resultRange;
        switch (containingToken.type) {
            case categoryType:
                resultRange = (_a = this.groupNames.categoryNames.get(containingToken.text)) === null || _a === void 0 ? void 0 : _a.range;
                break;
            case macroType:
                resultRange = (_b = this.groupNames.macroNames.get(containingToken.text)) === null || _b === void 0 ? void 0 : _b.range;
                break;
            case phonemeClassType:
                resultRange = (_c = this.groupNames.classNames.get(containingToken.text)) === null || _c === void 0 ? void 0 : _c.range;
                break;
        }
        // this shouldn't happen but just in case
        if (!resultRange) {
            return undefined;
        }
        return new vscode.Location(document.uri, resultRange);
    }
    provideReferences(document, position, context, token) {
        // find the token that contains it
        const containingToken = this.findContainingToken(position);
        if (!containingToken) {
            return [];
        }
        // filter only the tokens with the same text, and map them to positions
        return this.allTokens.filter(el => el.text === containingToken.text)
            .map(el => new vscode.Location(document.uri, el.range));
    }
    prepareRename(document, position, token) {
        const containingToken = this.findContainingToken(position);
        if (containingToken) {
            return containingToken.range;
        }
        else {
            throw new Error('Can only rename macros, classes, and categories.');
        }
    }
    provideRenameEdits(document, position, newName, token) {
        // first, see if there's even a change to be made
        const containingToken = this.findContainingToken(position);
        if (!containingToken) {
            return undefined;
        }
        return new Promise((resolve, reject) => {
            // I'm not using the CancellationToken because there's practically no documentation on how to do so.
            // if the new name is not legal, reject the promise
            switch (containingToken.type) {
                case macroType:
                    if (newName[0] !== '$') {
                        reject('Invalid macro name.');
                        return;
                    }
                    break;
                case phonemeClassType:
                    if (newName.length !== 1) {
                        reject('Invalid phoneme class name.');
                        return;
                    }
                    break;
                case categoryType:
                    if (newName.length <= 1) {
                        reject('Invalid category name.');
                        return;
                    }
            }
            // All seems to be good
            const edits = new vscode.WorkspaceEdit();
            this.allTokens.filter(el => el.text === containingToken.text)
                .forEach(el => edits.replace(document.uri, el.range, newName));
            resolve(edits);
        });
    }
    provideDeclaration(document, position, token) {
        var _a, _b, _c;
        const containingToken = this.findContainingToken(position);
        if (!containingToken) {
            return undefined;
        }
        let resultRange;
        switch (containingToken.type) {
            case categoryType:
                // this is a bit harder
                resultRange = (_a = this.allTokens.find(el => el.text === containingToken.text && el.modifiers.includes('declaration'))) === null || _a === void 0 ? void 0 : _a.range;
                break;
            case macroType:
                resultRange = (_b = this.groupNames.macroNames.get(containingToken.text)) === null || _b === void 0 ? void 0 : _b.range;
                break;
            case phonemeClassType:
                resultRange = (_c = this.groupNames.classNames.get(containingToken.text)) === null || _c === void 0 ? void 0 : _c.range;
                break;
        }
        // this shouldn't happen but just in case
        if (!resultRange) {
            return undefined;
        }
        return new vscode.Location(document.uri, resultRange);
    }
    findContainingToken(position) {
        return this.allTokens.find(el => el.range.contains(position));
    }
    getGroups(document) {
        const lines = document.getText().split('\n');
        this.groupNames = new GroupNames();
        const declaredCategories = new Set();
        for (let i = 0; i < lines.length; ++i) {
            // remove any comments or excess whitespace
            const origLine = lines[i].split('#')[0];
            const trimmedLine = origLine.trim();
            if (trimmedLine.startsWith('categories:')) {
                // parse out category names
                let cats = trimmedLine.substring(11).split(/\s+/gu);
                // remove any weights provided and add them to the set
                cats.forEach(el => declaredCategories.add(el.split(':')[0]));
            }
            else if (trimmedLine.includes('=')) {
                // determine whether it's a class or a macro
                const name = trimmedLine.split('=')[0].trimEnd();
                if (name[0] === '$') {
                    // it's a macro
                    this.groupNames.macroNames.set(name, new vscode.Location(document.uri, new vscode.Position(i, origLine.indexOf('$'))));
                }
                else if (name.length === 1) {
                    // it's a class
                    this.groupNames.classNames.set(name, new vscode.Location(document.uri, new vscode.Position(i, origLine.indexOf(name))));
                }
                else if (declaredCategories.has(name)) {
                    // it's a category. it already exists, but the location wasn't known
                    this.groupNames.categoryNames.set(name, new vscode.Location(document.uri, new vscode.Position(i, origLine.indexOf(name))));
                }
                // otherwise it's a mistake
            }
        }
    }
    findRanges(document) {
        const uri = document.uri;
        const lines = document.getText().split('\n');
        this.allTokens = [];
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
                    for (const [macroName, _] of this.groupNames.macroNames) {
                        if (trimmedLine.startsWith(macroName)) {
                            currMacro = macroName;
                            break;
                        }
                    }
                    this.allTokens.push(new Token(i, startIndex, currMacro, macroType, ['declaration', 'definition', 'readonly']));
                    for (let j = trimmedLine.indexOf('=') + 1; j < trimmedLine.length; ++j) {
                        if (this.groupNames.classNames.get(trimmedLine[j])) {
                            this.allTokens.push(new Token(i, startIndex + j, trimmedLine[j], phonemeClassType, []));
                        }
                    }
                }
                else {
                    // could be a category or class definition, or a mistake
                    const itemName = trimmedLine.split(/\s|=/u)[0];
                    if (itemName.length === 1) {
                        // it's a class name
                        this.allTokens.push(new Token(i, origLine.indexOf(itemName), itemName, phonemeClassType, ['declaration', 'definition', 'readonly']));
                    }
                    else if (this.groupNames.categoryNames.get(itemName)) {
                        // add one token for the category name, and then parse out any others it may reference
                        this.allTokens.push(new Token(i, origLine.indexOf(itemName), itemName, categoryType, ['definition']), ...this.tokensForWordShape(document, i, origLine.indexOf('=')));
                    }
                    // else, it's not recognized, just ignore it
                }
            }
            else if (trimmedLine.startsWith('categories:')) {
                // category declarations but not definitions
                const startIndex = origLine.indexOf('categories:');
                for (const [catName, _] of this.groupNames.categoryNames) {
                    const catNameIndex = trimmedLine.indexOf(catName, 11);
                    if (catNameIndex !== -1) {
                        this.allTokens.push(new Token(i, catNameIndex + startIndex, catName, categoryType, ['declaration']));
                    }
                }
            }
            else if (trimmedLine.startsWith('words:')) {
                // word shape definitions, may reference classes and macros
                this.allTokens.push(...this.tokensForWordShape(document, i, origLine.indexOf(':')));
            }
        }
    }
    tokensForWordShape(document, lineNumber, startIndex) {
        // remove the possibility of misparsing a comment
        const uri = document.uri;
        const line = document.getText().split('\n')[lineNumber].split('#')[0];
        const retVal = [];
        for (let j = startIndex; j < line.length; ++j) {
            // look for class and macro references
            if (this.groupNames.classNames.get(line[j])) {
                retVal.push(new Token(lineNumber, j, line[j], phonemeClassType, []));
            }
            else if (line[j] === '$') {
                // check if it matches any known macros
                const lineStartingAtMacroReference = line.substring(j);
                for (const [macroName, _] of this.groupNames.macroNames) {
                    if (lineStartingAtMacroReference.startsWith(macroName)) {
                        // success!
                        retVal.push(new Token(lineNumber, j, macroName, macroType, []));
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
exports.SemanticProvider = SemanticProvider;
;
