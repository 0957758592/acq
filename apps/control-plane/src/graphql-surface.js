import { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLScalarType, graphql } from 'graphql';

// GraphQL control surface (TZ §11.4) — a thin, generic wrapper over the SINGLE
// facade. One `op(operation, args)` field on both Query and Mutation routes
// through facade.execute; the RBAC role/actor come from the request context. No
// per-operation schema drift (the OPERATIONS catalog + validators are the
// contract) — GraphQL is presentation only, zero business logic.
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: () => { throw new Error('pass args as variables, not inline literals'); }
});

export function buildGraphqlSchema(facade, { role = 'operator' } = {}) {
  const Envelope = new GraphQLObjectType({
    name: 'Envelope',
    fields: { data: { type: JSONScalar }, error: { type: JSONScalar }, meta: { type: JSONScalar } }
  });
  const opField = {
    type: Envelope,
    args: { operation: { type: new GraphQLNonNull(GraphQLString) }, args: { type: JSONScalar } },
    resolve: (_root, { operation, args }, context) =>
      facade.execute(operation, { role: context?.role ?? role, actor: context?.actor, args: args ?? {}, correlationId: context?.correlationId })
  };
  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: { op: opField } }),
    mutation: new GraphQLObjectType({ name: 'Mutation', fields: { op: opField } })
  });
}

export function runGraphql(schema, { query, variables = {}, context = {} } = {}) {
  return graphql({ schema, source: query, variableValues: variables, contextValue: context });
}
