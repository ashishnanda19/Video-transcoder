// userHooks.ts
import { RootState } from "@/redux/reducer/userReducer";
import { useSelector } from "react-redux";


export function useAuthenticationStatus() {
  const isAuthenticated = useSelector((state: RootState) => state.userReducer.isAuthenticated);
  return isAuthenticated;
}
