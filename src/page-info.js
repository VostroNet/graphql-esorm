
import {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  // GraphQLInt,
  // GraphQLList,
} from "graphql";

export default new GraphQLObjectType({
  name: "EsORMPageInfo",
  fields() {
    return {
      "hasNextPage": {
        type: GraphQLBoolean,
      },
      "hasPreviousPage": {
        type: GraphQLBoolean,
      },
      "startCursor": {
        type: GraphQLString,
      },
      "endCursor": {
        type: GraphQLString,
      },
    };
  },
});
