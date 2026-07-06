import { IsEmail, IsIn, IsOptional, Length, Matches, MinLength } from "class-validator";

const PHONE = /^[6-9]\d{9}$/; // Indian 10-digit mobile
const PHONE_MSG = "phone must be a valid 10-digit Indian mobile number";

export class SignupDto {
  @Matches(PHONE, { message: PHONE_MSG })
  phone!: string;

  @MinLength(8, { message: "password must be at least 8 characters" })
  password!: string;

  @IsOptional()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Self-service signup is limited to citizens and vendors (admin/RBI are provisioned). */
  @IsOptional()
  @IsIn(["CITIZEN", "VENDOR"], { message: "role must be CITIZEN or VENDOR" })
  role?: "CITIZEN" | "VENDOR";
}

export class VerifyOtpDto {
  @Matches(PHONE, { message: PHONE_MSG })
  phone!: string;

  @Length(6, 6, { message: "code must be 6 digits" })
  code!: string;
}

export class LoginDto {
  @Matches(PHONE, { message: PHONE_MSG })
  phone!: string;

  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @MinLength(1)
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @Matches(PHONE, { message: PHONE_MSG })
  phone!: string;
}

export class ResetPasswordDto {
  @Matches(PHONE, { message: PHONE_MSG })
  phone!: string;

  @Length(6, 6, { message: "code must be 6 digits" })
  code!: string;

  @MinLength(8, { message: "password must be at least 8 characters" })
  newPassword!: string;
}

export class LogoutDto {
  @IsOptional()
  refreshToken?: string;
}
