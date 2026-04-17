import Common "common";

module {
  public type UserId = Common.UserId;
  public type Timestamp = Common.Timestamp;
  public type SessionToken = Common.SessionToken;

  public type Role = {
    #admin;
    #user;
  };

  public type User = {
    id : UserId;
    username : Text;
    passwordHash : Text;
    role : Role;
    createdAt : Timestamp;
  };

  // Shared (API-boundary) view of a user — no passwordHash
  public type UserInfo = {
    id : UserId;
    username : Text;
    role : Role;
    createdAt : Timestamp;
  };

  public type LoginResult = {
    #ok : SessionToken;
    #err : Text;
  };

  public type CreateUserResult = {
    #ok : UserInfo;
    #err : Text;
  };

  public type SimpleResult = {
    #ok;
    #err : Text;
  };
};
