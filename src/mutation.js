

import {GraphQLBoolean, GraphQLList, GraphQLInputObjectType, GraphQLString, GraphQLInt} from "graphql";

import {fromGlobalId} from "graphql-relay/lib/node/node";

import dateType from "@vostro/graphql-types/lib/date";
import jsonType from "@vostro/graphql-types/lib/json";
import floatType from "@vostro/graphql-types/lib/float";

import {Types} from "@vostro/esorm";

export function createMutation(model) {
  const input = new GraphQLInputObjectType({
    name: `EsORM${model.modelName}CreateInput`,
    fields: Object.keys(model.schema.mappings).reduce((o, f) => {
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
    }),
  });

  return {
    type: GraphQLBoolean,
    args: {
      input: {
        type: new GraphQLList(input),
      },
    },
    async resolve(source, args, context, info) {
      await model.createBulk(args.input.map((data) => {
        return Object.keys(data).reduce((o, k) => {
          if ((["id"].concat(model.schema.globalKeys || [])).indexOf(k) > -1) {
            o[k] = fromGlobalId(data[k]).id;
          } else {
            o[k] = data[k];
          }
          return o;
        }, {});
      }), {context});
      return true;
    },
  };
}
