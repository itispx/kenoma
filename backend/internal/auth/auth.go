// Package auth holds the cryptographic primitives behind authentication:
// password hashing, access-token signing and verification, and opaque token
// generation. Everything here is a pure function with no project
// dependencies, so both the auth service and the HTTP middleware can use it
// without either depending on the other.
//
// The two token types work on opposite principles. An access token is a
// signed JWT that vouches for itself, so verifying it needs a secret but no
// database. A refresh or reset token is opaque random bytes that mean nothing
// on their own, so validating one is a database lookup and needs no secret.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Cost 12 is roughly 250ms per hash: slow enough to make offline cracking
// expensive, fast enough for a login request.
const bcryptCost = 12

func HashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func VerifyPassword(hash, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
}

type AccessClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// IssueAccessToken signs a short-lived access token carrying the user's id
// (as the standard "sub" claim) and email.
func IssueAccessToken(userID uuid.UUID, email, secret string, ttl time.Duration) (token string, expiresAt time.Time, err error) {
	expiresAt = time.Now().Add(ttl)
	claims := AccessClaims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

// ParseAccessToken validates the token's signature and expiry and returns its
// claims. An expired or tampered-with token comes back as an error, never as
// partially-trusted claims.
func ParseAccessToken(token, secret string) (*AccessClaims, error) {
	// Asked which key to verify with, once the token has been parsed but
	// before it is trusted. Every token here is signed with the same secret.
	keyForToken := func(*jwt.Token) (any, error) {
		return []byte(secret), nil
	}

	// Pin the algorithm rather than trusting the token's own "alg" header:
	// otherwise a forged token could name a different algorithm and have it
	// honored, which is the classic JWT algorithm-confusion attack.
	onlyHS256 := jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Name})

	claims := &AccessClaims{}
	if _, err := jwt.ParseWithClaims(token, claims, keyForToken, onlyHS256); err != nil {
		return nil, err
	}
	return claims, nil
}

// GenerateOpaqueToken returns a random 32-byte, base64url-encoded token
// suitable for refresh tokens and password reset tokens. Its security rests on
// being unguessable (256 bits from crypto/rand), not on any signature. Only
// its hash is ever persisted; the raw value is handed to the client once.
func GenerateOpaqueToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashToken hashes a raw opaque token for storage and lookup. Plain SHA-256
// is sufficient here, unlike for passwords: the input is already high-entropy
// random, so there is no dictionary or brute-force attack to slow down.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
