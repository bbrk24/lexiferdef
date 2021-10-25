import * as vscode from 'vscode';

const phonemeClassType = 'class';
const macroType = 'macro';
const categoryType = 'enumMember';

type Type = typeof phonemeClassType | typeof macroType | typeof categoryType;
type Modifier = 'declaration' | 'definition';

const tokenTypes: Type[] = [phonemeClassType, macroType, categoryType];
const tokenModifiers: Modifier[] = ['declaration', 'definition'];

const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

class GroupNames {
    classNames = new Map<string, vscode.Location>();
    macroNames = new Map<string, vscode.Location>();
    categoryNames = new Map<string, vscode.Location>();
}

class Token {
    readonly range: vscode.Range;

    constructor(
        lineNumber: number,
        firstChar: number,
        readonly text: string,
        readonly type: Type,
        readonly modifiers: Modifier[]
    ) {
        this.range = new vscode.Range(
            new vscode.Position(lineNumber, firstChar),
            new vscode.Position(lineNumber, firstChar + text.length)
        );
    }
}

class Provider implements vscode.DocumentSemanticTokensProvider, vscode.DefinitionProvider {
    private groupNames: GroupNames = new GroupNames();
    private allTokens: Token[] = [];

    provideDocumentSemanticTokens(document: vscode.TextDocument) {
        const tokenBuilder = new vscode.SemanticTokensBuilder(legend);

        this.getGroups(document);
        this.findRanges(document);

        this.allTokens.forEach(el =>
            tokenBuilder.push(el.range, el.type, el.modifiers)
        );

        return tokenBuilder.build();
    }

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ) {
        // find the token
        let containingToken: Token | undefined;

        for (const token of this.allTokens) {
            if (token.range.contains(position)) {
                containingToken = token;
                break;
            }
        }

        if (!containingToken) {
            return undefined;
        }

        // okay, we know what token it belongs to, now find its corresponding definition
        let resultRange: vscode.Range | undefined;
        switch (containingToken.type) {
        case categoryType:
            resultRange = this.groupNames.categoryNames.get(containingToken.text)?.range;
            break;
        case macroType:
            resultRange = this.groupNames.macroNames.get(containingToken.text)?.range;
            break;
        case phonemeClassType:
            resultRange = this.groupNames.classNames.get(containingToken.text)?.range;
            break;
        }

        if (!resultRange) {
            return undefined;
        }

        return new vscode.Location(document.uri, resultRange);
    }

    private getGroups(document: vscode.TextDocument) {
        const lines = document.getText().split('\n');
        this.groupNames = new GroupNames();

        const declaredCategories = new Set<string>();

        for (let i = 0; i < lines.length; ++i) {
            // remove any comments or excess whitespace
            const origLine = lines[i].split('#')[0];
            const trimmedLine = origLine.trim();

            if (trimmedLine.startsWith('categories:')) {
                // parse out category names
                let cats = trimmedLine.substring(11).split(/\s+/gu);
                // remove any weights provided and add them to the set
                cats.forEach(el =>
                    declaredCategories.add(el.split(':')[0])
                );
            } else if (trimmedLine.includes('=')) {
                // determine whether it's a class or a macro
                const name = trimmedLine.split('=')[0].trimEnd();
                if (name[0] === '$') {
                    // it's a macro
                    this.groupNames.macroNames.set(
                        name,
                        new vscode.Location(document.uri, new vscode.Position(i, origLine.indexOf('$')))
                    );
                } else if (name.length === 1) {
                    // it's a class
                    this.groupNames.classNames.set(
                        name,
                        new vscode.Location(document.uri, new vscode.Position(i, origLine.indexOf(name)))
                    );
                } else if (declaredCategories.has(name)) {
                    // it's a category. it already exists, but the location wasn't known
                    this.groupNames.categoryNames.set(
                        name,
                        new vscode.Location(document.uri, new vscode.Position(i, origLine.indexOf(name)))
                    );
                }
                // otherwise it's a mistake
            }
        }
    }

    private findRanges(document: vscode.TextDocument) {
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

                    this.allTokens.push(
                        new Token(i, startIndex, currMacro, macroType, ['declaration', 'definition'])
                    );
                    
                    for (let j = trimmedLine.indexOf('=') + 1; j < trimmedLine.length; ++j) {
                        if (this.groupNames.classNames.get(trimmedLine[j])) {
                            this.allTokens.push(
                                new Token(i, startIndex + j, trimmedLine[j], phonemeClassType, [])
                            );
                        }
                    }
                } else {
                    // could be a category or class definition, or a mistake
                    const itemName = trimmedLine.split(/\s|=/u)[0];
                    if (itemName.length === 1) {
                        // it's a class name
                        this.allTokens.push(
                            new Token(i, origLine.indexOf(itemName), itemName, phonemeClassType, ['declaration', 'definition'])
                        );
                    } else if (this.groupNames.categoryNames.get(itemName)) {
                        // add one token for the category name, and then parse out any others it may reference
                        this.allTokens.push(
                            new Token(i, origLine.indexOf(itemName), itemName, categoryType, ['definition']),
                            ...this.tokensForWordShape(document, i, origLine.indexOf('='))
                        );
                    }
                    // else, it's not recognized, just ignore it
                }
            } else if (trimmedLine.startsWith('categories:')) {
                // category declarations but not definitions
                const startIndex = origLine.indexOf('categories:');

                for (const [catName, _] of this.groupNames.categoryNames) {
                    const catNameIndex = trimmedLine.indexOf(catName, 11);
                    if (catNameIndex !== -1) {
                        this.allTokens.push(
                            new Token(i, catNameIndex + startIndex, catName, categoryType, ['declaration'])
                        );
                    }
                }
            } else if (trimmedLine.startsWith('words:')) {
                // word shape definitions, may reference classes and macros
                this.allTokens.push(...this.tokensForWordShape(document, i, origLine.indexOf(':')));
            }
        }
    }

    private tokensForWordShape(document: vscode.TextDocument, lineNumber: number, startIndex: number): Token[] {
        // remove the possibility of misparsing a comment
        const uri = document.uri;

        const line = document.getText().split('\n')[lineNumber].split('#')[0];
        
        const retVal: Token[] = [];

        for (let j = startIndex; j < line.length; ++j) {
            // look for class and macro references
            if (this.groupNames.classNames.get(line[j])) {
                retVal.push(
                    new Token(lineNumber, j, line[j], phonemeClassType, [])
                );
            } else if (line[j] === '$') {
                // check if it matches any known macros
                const lineStartingAtMacroReference = line.substring(j);
                for (const [macroName, _] of this.groupNames.macroNames) {
                    if (lineStartingAtMacroReference.startsWith(macroName)) {
                        // success!
                        retVal.push(
                            new Token(lineNumber, j, macroName, macroType, [])
                        );
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
    language: 'def'
}, provider, legend);

vscode.languages.registerDefinitionProvider({
    language: 'def'
}, provider);