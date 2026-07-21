/**
 * Minimal local ESLint plugin to mark JSX component identifiers as "used".
 *
 * Without `eslint-plugin-react`'s `react/jsx-uses-vars`, ESLint core `no-unused-vars`
 * can incorrectly flag imports used only in JSX (e.g. `<Button />`) as unused.
 */
module.exports = {
  rules: {
    'jsx-uses-vars': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Marks variables used in JSX as used (prevents false positives from no-unused-vars).'
        },
        schema: []
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();

        function markName(nameNode) {
          if (!nameNode) return;

          // <Foo />
          if (nameNode.type === 'JSXIdentifier') {
            sourceCode.markVariableAsUsed(nameNode.name, nameNode);
            return;
          }

          // <Foo.Bar />
          if (nameNode.type === 'JSXMemberExpression') {
            // Mark the left-most identifier (`Foo`) as used.
            let obj = nameNode.object;
            while (obj && obj.type === 'JSXMemberExpression') obj = obj.object;
            if (obj && obj.type === 'JSXIdentifier') sourceCode.markVariableAsUsed(obj.name, nameNode);
          }
        }

        return {
          JSXOpeningElement(node) {
            markName(node.name);
          },
          JSXOpeningFragment() {
            // nothing to mark for <>
          }
        };
      }
    }
  }
};


