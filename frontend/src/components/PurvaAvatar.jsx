import React from "react";

export default function PurvaAvatar({ size = 42, className = "", style = {} }) {
  return (
    <img
      src="/purva-logo.svg"
      alt="Purva AI"
      className={className}
      style={{
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
        borderRadius: "50%",
        display: "inline-block",
        flexShrink: 0,
        objectFit: "contain",
        ...style,
      }}
    />
  );
}
