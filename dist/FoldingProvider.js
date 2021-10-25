"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class FoldingProvider {
    provideFoldingRanges(document, context, token) {
        const lines = document.getText().split('\n');
        const retVal = [];
        // Search for two types of ranges:
        // 1. Starting at a heading and ending at the next heading
        // 2. A group of comments
        // I may add more in the future, I may not
        let sectionStartLine, commentStartLine;
        let currentlyInHeading = false;
        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i].trim();
            if (currentlyInHeading) {
                if (line[0] !== '#') {
                    currentlyInHeading = false;
                }
            }
            else {
                if (line.match(/##+/u)) {
                    currentlyInHeading = true;
                    if (sectionStartLine !== undefined) {
                        // end the previous section before starting a new one
                        retVal.push(new vscode.FoldingRange(sectionStartLine, i - 1, vscode.FoldingRangeKind.Region));
                    }
                    sectionStartLine = i;
                }
                else if (line[0] === '#' && commentStartLine === undefined) {
                    // we found the start of a comment block
                    commentStartLine = i;
                }
                else if (line[0] !== '#' && commentStartLine !== undefined) {
                    // we found the end of a comment block
                    retVal.push(new vscode.FoldingRange(commentStartLine, i - 1, vscode.FoldingRangeKind.Comment));
                    commentStartLine = undefined;
                }
            }
        }
        // clean up any ending ranges
        if (sectionStartLine) {
            // I'm checking falsy rather than undefined on purpose
            // don't want to collapse the entire document
            retVal.push(new vscode.FoldingRange(sectionStartLine, lines.length - 1, vscode.FoldingRangeKind.Region));
        }
        if (commentStartLine !== undefined) {
            retVal.push(new vscode.FoldingRange(commentStartLine, lines.length - 1, vscode.FoldingRangeKind.Comment));
        }
        return retVal;
    }
}
exports.default = FoldingProvider;
;
