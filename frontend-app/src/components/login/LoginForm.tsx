/*
    Not currently in use.
    This component is used to render the login form with email and password fields.
    Oauth is being used for login instead of email and password.
*/

import { Button } from "@components/login/Button";
import { TextField } from "@components/login/Fields";

export const LoginForm = () => {
  return (
    <form action="#" className="mt-10 grid grid-cols-1 gap-y-8">
      <TextField
        label="Email address"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        label="Password"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <div>
        <Button
          type="submit"
          variant="solid"
          color="blue"
          className="w-full"
          href={"/"}
        >
          <span>
            Sign in <span aria-hidden="true">&rarr;</span>
          </span>
        </Button>
      </div>
    </form>
  );
};
