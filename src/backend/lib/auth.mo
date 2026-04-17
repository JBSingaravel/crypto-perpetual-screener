import Types "../types/auth";
import Map "mo:core/Map";
import List "mo:core/List";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Int "mo:core/Int";

module {
  // Hash a password using a deterministic polynomial accumulation over UTF-8 bytes.
  // Deterministic and one-way for this canister's purposes.
  public func hashPassword(password : Text) : Text {
    let bytes = password.encodeUtf8();
    var h : Nat = 5381;
    for (byte in bytes.vals()) {
      // djb2-style: h = h * 33 + byte
      h := h * 33 + Nat.fromNat8(byte);
    };
    h.toText();
  };

  // Verify a password against a stored hash.
  public func verifyPassword(password : Text, hash : Text) : Bool {
    hashPassword(password) == hash;
  };

  // Generate a unique session token combining userId, timestamp, and a simple nonce.
  public func generateToken(userId : Types.UserId, now : Types.Timestamp) : Types.SessionToken {
    "tok_" # userId.toText() # "_" # now.toText();
  };

  // Create a new User record.
  public func newUser(
    id : Types.UserId,
    username : Text,
    passwordHash : Text,
    role : Types.Role,
    now : Types.Timestamp,
  ) : Types.User {
    { id; username; passwordHash; role; createdAt = now };
  };

  // Convert internal User to public UserInfo (drops passwordHash).
  public func toUserInfo(user : Types.User) : Types.UserInfo {
    { id = user.id; username = user.username; role = user.role; createdAt = user.createdAt };
  };

  // Find user by username in a list.
  public func findByUsername(users : List.List<Types.User>, username : Text) : ?Types.User {
    users.find(func(u) { u.username == username });
  };

  // Find user by id in a list.
  public func findById(users : List.List<Types.User>, id : Types.UserId) : ?Types.User {
    users.find(func(u) { u.id == id });
  };

  // Resolve session token to user id.
  public func resolveToken(sessions : Map.Map<Types.SessionToken, Types.UserId>, token : Types.SessionToken) : ?Types.UserId {
    sessions.get(token);
  };

  // Check if the calling user (by token) is admin.
  public func isAdmin(
    sessions : Map.Map<Types.SessionToken, Types.UserId>,
    users : List.List<Types.User>,
    token : Types.SessionToken,
  ) : Bool {
    switch (resolveToken(sessions, token)) {
      case null false;
      case (?uid) {
        switch (findById(users, uid)) {
          case null false;
          case (?user) user.role == #admin;
        };
      };
    };
  };
};
