import Types "types/auth";
import AuthMixin "mixins/auth-api";
import Map "mo:core/Map";
import List "mo:core/List";

actor {
  // Stable state — persists across upgrades via enhanced orthogonal persistence
  let users = List.empty<Types.User>();
  let sessions = Map.empty<Types.SessionToken, Types.UserId>();
  let nextUserId = { var value : Types.UserId = 0 };
  let seeded = { var value : Bool = false };

  include AuthMixin(users, sessions, nextUserId, seeded);
};
