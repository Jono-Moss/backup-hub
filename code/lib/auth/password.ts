import * as argon2 from "argon2";

// argon2id (the default the `argon2` package uses) is the recommended
// variant for password hashing — resistant to both GPU-cracking and
// side-channel attacks. Defaults are deliberately not overridden here;
// they track the library's recommended, periodically-updated parameters.
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext);
}

export async function verifyPassword(hashed: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hashed, plaintext);
  } catch {
    // verify() throws on a malformed/foreign hash rather than returning
    // false — treat that the same as "wrong password".
    return false;
  }
}

export function isPasswordStrongEnough(plaintext: string): boolean {
  return plaintext.length >= 8;
}
