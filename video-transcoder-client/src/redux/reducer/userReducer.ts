import { createSlice } from "@reduxjs/toolkit";

// <any> will be replaceed by user type

export interface UserType {
  displayName: String;
  googleId: String;
  email: String;
  avatar: String;
}

interface UserReducerInitialState {
  user: UserType | null;
  isAuthenticated: boolean;
  loader: boolean;
}

const initialState: UserReducerInitialState = {
  user: null,
  isAuthenticated: false,
  loader: true,
};

export type RootState = {
  userReducer: UserReducerInitialState; // Assuming your userReducer slice state is called UserReducerInitialState
  // Add other slice states here if you have them
};

export const userReducer = createSlice({
  name: "userReducer",
  initialState,
  reducers: {
    userExist: (state, action) => {
      state.loader = false;
      state.isAuthenticated = true;
      state.user = action.payload;
    },
    userNotExist: (state) => {
      state.loader = false;
      state.isAuthenticated = false;
      state.user = null;
    },
  },
});

export const { userExist, userNotExist } = userReducer.actions;

