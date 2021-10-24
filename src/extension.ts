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
    classNames = new Set<string>();
    macroNames = new Set<string>();
    categoryNames = new Set<string>();
}

class Token {
    readonly range: vscode.Range;
    
    constructor(
        lineNumber: number,
        firstChar: number,
        length: number,
        readonly type: Type,
        readonly modifiers: Modifier[]
    ) {
        this.range = new vscode.Range(
            new vscode.Position(lineNumber, firstChar),
            new vscode.Position(lineNumber, firstChar + length)
        );
    }
}

class Provider implements vscode.DocumentSemanticTokensProvider {
    private groupNames: GroupNames = new GroupNames();

    provideDocumentSemanticTokens(document: vscode.TextDocument) {
        const tokenBuilder = new vscode.SemanticTokensBuilder(legend);
        const docText = document.getText();

        this.getGroups(docText);
        const tokens = this.findRanges(docText);

        tokens.forEach(el =>
            tokenBuilder.push(el.range, el.type, el.modifiers)
        );

        return tokenBuilder.build();
    }

    private getGroups(docText: string) {
        const lines = docText.split('\n');
        this.groupNames = new GroupNames();

        for (let line of lines) {
            // remove any comments or excess whitespace
            line = line.split('#')[0].trim();

            if (line.startsWith('categories:')) {
                // parse out category names
                let cats = line.substring(11).split(/\s+/gu);
                // remove any weights provided and add them to the set
                cats.forEach(el => 
                    this.groupNames.categoryNames.add(el.split(':')[0])
                );
            } else if (line.includes('=')) {
                // determine whether it's a class or a macro
                const name = line.split('=')[0].trimEnd();
                if (name[0] === '$') {
                    // it's a macro
                    this.groupNames.macroNames.add(name);
                } else if (name.length === 1) {
                    // it's a class
                    this.groupNames.classNames.add(name);
                }
                // otherwise it's either a category or a mistake
            }
        }
    }

    private findRanges(docText: string): Token[] {
        const lines = docText.split('\n');
        const retVal: Token[] = [];

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

                    retVal.push(
                        new Token(i, startIndex, currMacro.length, macroType, ['declaration', 'definition'])
                    );
                    
                    for (let j = trimmedLine.indexOf('=') + 1; j < trimmedLine.length; ++j) {
                        if (this.groupNames.classNames.has(trimmedLine[j])) {
                            retVal.push(
                                new Token(i, startIndex + j, 1, phonemeClassType, [])
                            );
                        }
                    }
                } else {
                    // could be a category or class definition, or a mistake
                    const itemName = trimmedLine.split(/\s|=/u)[0];
                    if (itemName.length === 1) {
                        // it's a class name
                        retVal.push(
                            new Token(i, origLine.indexOf(itemName), 1, phonemeClassType, ['declaration', 'definition'])
                        );
                    } else if (this.groupNames.categoryNames.has(itemName)) {
                        // add one token for the category name, and then parse out any others it may reference
                        retVal.push(
                            new Token(i, origLine.indexOf(itemName), itemName.length, categoryType, ['definition']),
                            ...this.tokensForWordShape(origLine, i, origLine.indexOf('='))
                        );
                    }
                    // else, it's not recognized, just ignore it
                }
            } else if (trimmedLine.startsWith('categories:')) {
                // category declarations but not definitions
                const startIndex = origLine.indexOf('categories:');

                for (const catName of this.groupNames.categoryNames) {
                    const catNameIndex = trimmedLine.indexOf(catName, 11);
                    if (catNameIndex !== -1) {
                        retVal.push(
                            new Token(i, catNameIndex + startIndex, catName.length, categoryType, ['declaration'])
                        );
                    }
                }
            } else if (trimmedLine.startsWith('words:')) {
                // word shape definitions, may reference classes and macros
                retVal.push(...this.tokensForWordShape(origLine, i, origLine.indexOf(':')));
            }
        }

        return retVal;
    }

    private tokensForWordShape(line: string, lineNumber: number, startIndex: number): Token[] {
        // remove the possibility of misparsing a comment
        line = line.split('#')[0];
        
        const retVal: Token[] = [];

        for (let j = startIndex; j < line.length; ++j) {
            // look for class and macro references
            if (this.groupNames.classNames.has(line[j])) {
                retVal.push(
                    new Token(lineNumber, j, 1, phonemeClassType, [])
                );
            } else if (line[j] === '$') {
                // check if it matches any known macros
                const lineStartingAtMacroReference = line.substring(j);
                for (const macroName of this.groupNames.macroNames) {
                    if (lineStartingAtMacroReference.startsWith(macroName)) {
                        // success!
                        retVal.push(
                            new Token(lineNumber, j, macroName.length, macroType, [])
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
    language: 'def',
    scheme: 'file'
}, provider, legend);
