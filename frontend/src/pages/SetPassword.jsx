import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import "./AdminLogin.css";

const MIN_LENGTH = 8;

/**
 * Landing page for staff invite and password-reset emails.
 * The link carries a one-time token_hash; it is redeemed only on submit,
 * so email scanners that open the link don't use it up.
 */
const SetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") === "recovery" ? "recovery" : "invite";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Set once the token is redeemed, so a retry after a failed update doesn't redeem it again
  const [verified, setVerified] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // Admin login trims passwords, so don't allow surrounding spaces here
    const newPassword = password.trim();
    if (newPassword.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirm.trim()) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      if (!verified) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (verifyError) {
          throw new Error("This link has expired or was already used. Ask your super admin to resend the invite.");
        }
        setVerified(true);
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message);

      await supabase.auth.signOut();
      navigate("/admin/login", { replace: true, state: { message: "Password set. Sign in with your email and new password." } });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mt-5 mb-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow-lg p-5 border-0 rounded-4">
            <div className="text-center mb-4">
              <div className="mx-auto mb-3 d-flex justify-content-center align-items-center bg-light rounded-circle admin-login-icon">
                <svg width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h3 className="fw-bold mb-1 admin-login-title">
                {type === "invite" ? "Set up your account" : "Reset your password"}
              </h3>
              <p className="text-muted small">Choose a password for the Puravankara GRM admin portal.</p>
            </div>

            {!tokenHash ? (
              <div className="alert alert-danger py-2 text-center fw-semibold fs-14">
                This link is incomplete. Open the link from your email again, or ask your super admin to resend it.
              </div>
            ) : (
              <>
                {error && (
                  <div className="alert alert-danger py-2 text-center fw-semibold fs-14">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="fw-semibold small mb-1">New password</label>
                    <input
                      type="password"
                      className="form-control bg-light"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={MIN_LENGTH}
                      autoComplete="new-password"
                      required
                    />
                    <div className="form-text">At least {MIN_LENGTH} characters.</div>
                  </div>
                  <div className="mb-4">
                    <label className="fw-semibold small mb-1">Confirm password</label>
                    <input
                      type="password"
                      className="form-control bg-light"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary w-100 fw-semibold" disabled={isLoading}>
                    {isLoading ? "Saving..." : "Set password"}
                  </button>
                </form>
              </>
            )}

            <div className="text-center mt-4">
              <Link to="/admin/login" className="small text-muted text-decoration-none">Back to admin login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetPassword;
