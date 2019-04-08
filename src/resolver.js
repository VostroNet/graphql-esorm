
import {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLID,
  GraphQLEnumType,
} from "graphql";
import {replaceIdDeep, replaceKeyDeep} from "./utils/replace";

import {toGlobalId} from "graphql-relay/lib/node/node";
import { toCursor, fromCursor } from "./cursor";
import GQLPageInfo from "./page-info";

import dateType from "@vostro/graphql-types/lib/date";
import jsonType from "@vostro/graphql-types/lib/json";
import floatType from "@vostro/graphql-types/lib/float";
import {Types} from "@vostro/esorm";

export function createEdgeNodeType(model, options, customNode, customEdgeName) {
  const name = model.modelName;
  const node = customNode || new GraphQLObjectType({
    name: `EsORM${name}Node`,
    fields() {
      return Object.assign({
        id: {
          type: GraphQLID,
          resolve(source, args, context, info) {
            return toGlobalId(name, source.id);
          },
        },
      }, Object.keys(model.schema.mappings).reduce((o, f) => {
        let type;
        const fieldDefinition = model.schema.mappings[f];
        switch (fieldDefinition.type) {
          case Types.Float:
            type = floatType;
            break;
          case Types.Integer:
            type = GraphQLInt;
            break;
          case Types.Boolean:
            type = GraphQLBoolean;
            break;
          case Types.date:
            type = dateType;
            break;
          case Types.IntegerRange:
          case Types.FloatRange:
          case Types.LongRange:
          case Types.DoubleRange:
          case Types.DateRange:
          case Types.object:
          case Types.Nested:
          case Types.GeoPoint:
          case Types.GeoShape:
          case Types.IP:
          case Types.Completion:
          case Types.TokenCount:
          case Types.Murmur3:
          case Types.AnnotatedText:
          case Types.Percolator:
          case Types.Join:
          case Types.Alias:
            type = jsonType;
            break;
          default:
            type = GraphQLString;
        }
        o[f] = {
          type,
        };
        return o;
      }, {}), isFunction(options.fields) ? options.fields() : options.fields);
    },
  });
  const edge = new GraphQLObjectType({
    name: customEdgeName || `EsORM${name}Edge`,
    fields: {
      cursor: {
        type: GraphQLString,
      },
      node: {
        type: node,
      },
    },
  });
  return {
    node,
    edge: new GraphQLObjectType({
      name: `EsORM${name}`,
      fields: {
        pageInfo: {
          type: GQLPageInfo,
        },
        total: {
          type: GraphQLInt,
        },
        edges: {
          type: new GraphQLList(edge),
        },
      },
    }),
  };
}


export function createResolver(model, options, defaultFindOptions, customEdge, customNode, customEdgeName) {
  let edge;
  let modelGQL = model.gql || {};
  if (!modelGQL.edge && !customEdge && !customNode) {
    modelGQL = createEdgeNodeType(model, options);
    edge = modelGQL.edge;
  } else if (!modelGQL.edge && !customEdge && customNode) {
    if (!customEdgeName && customEdgeName !== "") {
      throw new Error("Unable to create custom node resolver without a custom edge name");
    }
    if (modelGQL[`_${customEdgeName}`]) {
      edge = modelGQL[`_${customEdgeName}`];
    } else {
      modelGQL = createEdgeNodeType(model, options, customNode, customEdgeName);
      edge = modelGQL.edge;
      model.gql = modelGQL;
    }
  } else if (customEdge) {
    edge = customEdge;
  } else if (modelGQL.edge) {
    edge = model.gql.edge;
  }
  if (!edge) {
    throw new Error("Unable to create resolver without an edge specified");
  }


  return {
    args: createDefaultArgs(options, model),
    type: edge,
    async resolve(source, args = {}, context, info) {
      const groups = (args.groupBy || []).length === 0 ? ["*"] : args.groupBy;
      const initOpts = {
        context,
        groups,
        raw: true,
      };
      let findOptions = Object.assign({gql: {source, args, context, info}}, initOpts, isFunction(defaultFindOptions) ?
        defaultFindOptions(initOpts, {source, args, context, info}) : defaultFindOptions);

      if (args.first || args.last) {
        findOptions.size = parseInt(args.first || args.last, 10);
      }
      let cursor;
      if (args.after || args.before) {
        cursor = fromCursor(args.after || args.before);
        let startIndex = Number(cursor.index);
        if (startIndex >= 0) {
          findOptions.from = startIndex + 1;
        }
      }
      if (args.query) {
        findOptions.query = replaceIdDeep(findOptions.query, ["id"].concat(model.schema.globalKeys || []), info.variableValues);
      }


      const [fullCount, results] = await Promise.all([
        model.count(Object.assign({
          context,
          query: findOptions.query,
        }, findOptions)),
        model.findAll(findOptions),
      ]);

      const edges = results.map((row, idx) => {
        let startIndex = null;
        if (cursor) {
          startIndex = Number(cursor.index);
        }
        if (startIndex !== null) {
          startIndex++;
        } else {
          startIndex = 0;
        }
        return {
          cursor: toCursor(model.name, idx + startIndex),
          node: row,
        };
      });

      let firstEdge = edges[0];
      let lastEdge = edges[edges.length - 1];

      let hasNextPage = false;
      let hasPreviousPage = false;
      if (args.first || args.last) {
        const count = parseInt(args.first || args.last, 10);
        let index = cursor ? Number(cursor.index) : null;
        if (index !== null) {
          index++;
        } else {
          index = 0;
        }
        hasNextPage = index + 1 + count <= fullCount;
        hasPreviousPage = index - count >= 0;
        if (args.last) {
          [hasNextPage, hasPreviousPage] = [hasPreviousPage, hasNextPage];
        }
      }
      return {
        pageInfo: {
          startCursor: firstEdge ? firstEdge.cursor : null,
          endCursor: lastEdge ? lastEdge.cursor : null,
          hasNextPage: hasNextPage,
          hasPreviousPage: hasPreviousPage,
        },
        total: fullCount,
        edges,
      };
    },
  };
}
//todo AddFunction [] enums
//todo AddGroup [] enums
export function createDefaultArgs(options, model) {
  let args = Object.assign({
    after: {
      type: GraphQLString,
    },
    first: {
      type: GraphQLInt,
    },
    before: {
      type: GraphQLString,
    },
    last: {
      type: GraphQLInt,
    },
    query: {
      type: jsonType,
    },
  }, options.args);
  return args;
}


function isFunction(functionToCheck) {
  return functionToCheck && {}.toString.call(functionToCheck) === "[object Function]";
}
