import { configureStore } from "@reduxjs/toolkit";
import { userReducer } from "./reducer/userReducer";


export const store = configureStore({
  reducer: {
    [userReducer.name]: userReducer.reducer,
  },
});


