import Types "../types/auth";
import AuthLib "../lib/auth";
import Map "mo:core/Map";
import List "mo:core/List";
import Time "mo:core/Time";

mixin (
  users : List.List<Types.User>,
  sessions : Map.Map<Types.SessionToken, Types.UserId>,
  nextUserId : { var value : Types.UserId },
  seeded : { var value : Bool },
) {
  // Seed the default admin account on first call if not already seeded.
  func ensureSeeded() {
    if (not seeded.value) {
      let now = Time.now();
      let adminUser = AuthLib.newUser(
        nextUserId.value,
        "admin",
        AuthLib.hashPassword("admin123"),
        #admin,
        now,
      );
      users.add(adminUser);
      nextUserId.value += 1;
      seeded.value := true;
    };
  };

  // Authenticate with username + password. Returns a session token on success.
  public shared func login(username : Text, password : Text) : async Types.LoginResult {
    ensureSeeded();
    switch (AuthLib.findByUsername(users, username)) {
      case null #err("Invalid username or password");
      case (?user) {
        if (AuthLib.verifyPassword(password, user.passwordHash)) {
          let token = AuthLib.generateToken(user.id, Time.now());
          sessions.add(token, user.id);
          #ok(token);
        } else {
          #err("Invalid username or password");
        };
      };
    };
  };

  // Invalidate a session token (logout).
  public shared func logout(token : Types.SessionToken) : async Types.SimpleResult {
    sessions.remove(token);
    #ok;
  };

  // Return the UserInfo for the owner of the given session token.
  public shared func getCurrentUser(token : Types.SessionToken) : async ?Types.UserInfo {
    switch (AuthLib.resolveToken(sessions, token)) {
      case null null;
      case (?uid) {
        switch (AuthLib.findById(users, uid)) {
          case null null;
          case (?user) ?AuthLib.toUserInfo(user);
        };
      };
    };
  };

  // Admin-only: create a new normal user.
  public shared func createUser(
    adminToken : Types.SessionToken,
    username : Text,
    password : Text,
  ) : async Types.CreateUserResult {
    ensureSeeded();
    if (not AuthLib.isAdmin(sessions, users, adminToken)) {
      return #err("Unauthorized: admin access required");
    };
    switch (AuthLib.findByUsername(users, username)) {
      case (?_) #err("Username already exists");
      case null {
        let now = Time.now();
        let newUser = AuthLib.newUser(
          nextUserId.value,
          username,
          AuthLib.hashPassword(password),
          #user,
          now,
        );
        users.add(newUser);
        nextUserId.value += 1;
        #ok(AuthLib.toUserInfo(newUser));
      };
    };
  };

  // Admin-only: list all users.
  public shared func listUsers(adminToken : Types.SessionToken) : async { #ok : [Types.UserInfo]; #err : Text } {
    ensureSeeded();
    if (not AuthLib.isAdmin(sessions, users, adminToken)) {
      return #err("Unauthorized: admin access required");
    };
    let infos = users.map<Types.User, Types.UserInfo>(AuthLib.toUserInfo);
    #ok(infos.toArray());
  };

  // Admin-only: delete a user by username.
  public shared func deleteUser(
    adminToken : Types.SessionToken,
    username : Text,
  ) : async Types.SimpleResult {
    ensureSeeded();
    if (not AuthLib.isAdmin(sessions, users, adminToken)) {
      return #err("Unauthorized: admin access required");
    };
    if (username == "admin") {
      return #err("Cannot delete the admin account");
    };
    let sizeBefore = users.size();
    let filtered = users.filter(func(u) { u.username != username });
    if (filtered.size() == sizeBefore) {
      return #err("User not found");
    };
    users.clear();
    users.append(filtered);
    #ok;
  };

  // Admin-only: update a user's username and/or password.
  public shared func updateUser(
    adminToken : Types.SessionToken,
    username : Text,
    newUsername : Text,
    newPassword : Text,
  ) : async Types.SimpleResult {
    ensureSeeded();
    if (not AuthLib.isAdmin(sessions, users, adminToken)) {
      return #err("Unauthorized: admin access required");
    };
    switch (users.findIndex(func(u) { u.username == username })) {
      case null #err("User not found");
      case (?idx) {
        // If renaming, check the new username is not already taken by another user
        if (newUsername != username) {
          switch (AuthLib.findByUsername(users, newUsername)) {
            case (?_) return #err("Username already taken");
            case null {};
          };
        };
        let user = users.at(idx);
        let updatedHash = if (newPassword == "") {
          user.passwordHash;
        } else {
          AuthLib.hashPassword(newPassword);
        };
        let updated = { user with username = newUsername; passwordHash = updatedHash };
        users.put(idx, updated);
        #ok;
      };
    };
  };

  // Change the authenticated user's own password.
  public shared func changePassword(
    token : Types.SessionToken,
    oldPassword : Text,
    newPassword : Text,
  ) : async Types.SimpleResult {
    switch (AuthLib.resolveToken(sessions, token)) {
      case null #err("Invalid or expired session");
      case (?uid) {
        switch (users.findIndex(func(u) { u.id == uid })) {
          case null #err("User not found");
          case (?idx) {
            let user = users.at(idx);
            if (not AuthLib.verifyPassword(oldPassword, user.passwordHash)) {
              return #err("Current password is incorrect");
            };
            let updated = { user with passwordHash = AuthLib.hashPassword(newPassword) };
            users.put(idx, updated);
            #ok;
          };
        };
      };
    };
  };
};
