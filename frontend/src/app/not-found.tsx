"use client";

import React from "react";
import Link from "next/link";

import Logo from "../components/Logo";
import ThemeSwitch from "../components/ThemeSwitch";

/**
 * 404 sayfası.
 *
 * Televizyon çizimi kendi sıcak paletini koruyor — bir illüstrasyon, marka
 * renklerine birebir uymak zorunda değil. Ama zemin, düğmeler ve hoparlör
 * noktaları tema değişkenlerinden geliyor: eskiden sabit mor (#290f28) idi ve
 * açık temada sayfanın geri kalanından kopuyordu.
 */
export default function NotFound() {
    return (
        <main
            className="min-h-screen flex flex-col items-center justify-center overflow-hidden relative p-4"
            style={{ backgroundColor: "var(--bg)", color: "var(--fg)" }}
        >
            <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 pointer-events-none">
                <Link href="/" className="pointer-events-auto" aria-label="Askesis home">
                    <Logo size={30} />
                </Link>
                <span className="pointer-events-auto">
                    <ThemeSwitch />
                </span>
            </div>

            <StyledWrapper>
                <div className="main_wrapper">
                    <div className="main">
                        <div className="antenna">
                            <div className="antenna_shadow" />
                            <div className="a1" />
                            <div className="a1d" />
                            <div className="a2" />
                            <div className="a2d" />
                            <div className="a_base" />
                        </div>
                        <div className="tv">
                            <div className="cruve">
                                <svg
                                    className="curve_svg"
                                    version="1.1"
                                    xmlns="http://www.w3.org/2000/svg"
                                    xmlnsXlink="http://www.w3.org/1999/xlink"
                                    viewBox="0 0 189.929 189.929"
                                    xmlSpace="preserve"
                                >
                                    <path d="M70.343,70.343c-30.554,30.553-44.806,72.7-39.102,115.635l-29.738,3.951C-5.442,137.659,11.917,86.34,49.129,49.13 C86.34,11.918,137.664-5.445,189.928,1.502l-3.95,29.738C143.041,25.54,100.895,39.789,70.343,70.343z" />
                                </svg>
                            </div>
                            <div className="display_div">
                                <div className="screen_out">
                                    <div className="screen_out1">
                                        <div className="screen">
                                            <span className="notfound_text"> NOT FOUND</span>
                                        </div>
                                        <div className="screenM">
                                            <span className="notfound_text"> NOT FOUND</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="lines">
                                <div className="line1" />
                                <div className="line2" />
                                <div className="line3" />
                            </div>
                            <div className="buttons_div">
                                <div className="b1">
                                    <div />
                                </div>
                                <div className="b2" />
                                <div className="speakers">
                                    <div className="g1">
                                        <div className="g11" />
                                        <div className="g12" />
                                        <div className="g13" />
                                    </div>
                                    <div className="g" />
                                    <div className="g" />
                                </div>
                            </div>
                        </div>
                        <div className="bottom">
                            <div className="base1" />
                            <div className="base2" />
                            <div className="base3" />
                        </div>
                    </div>
                    <div className="text_404">
                        <div className="text_4041">4</div>
                        <div className="text_4042">0</div>
                        <div className="text_4043">4</div>
                    </div>
                </div>
            </StyledWrapper>

            <p
                className="z-20 mt-4 text-sm text-center max-w-[36ch]"
                style={{ color: "var(--fg-muted)", fontFamily: "var(--font-geist-sans)" }}
            >
                This page does not exist. It may have been moved, or the link was
                mistyped.
            </p>

            <Link href="/" className="btn-create-account z-20 mt-6">
                Back to safety
                <div className="icon">
                    <svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 0h24v24H0z" fill="none" />
                        <path
                            d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                            fill="currentColor"
                        />
                    </svg>
                </div>
            </Link>
        </main>
    );
}

function StyledWrapper({ children }: { children: React.ReactNode }) {
    return (
        <>
            <style jsx global>{`
        /* Televizyonun kendi paleti.
           Tema değişkenlerine bağlamak yerine iki tema için ayrı değerler:
           çizimdeki gölgeler ve iç parlamalar bu tona göre ayarlı, doğrudan
           var(--bg) vermek onları bozuyor. */
        :root[data-theme="dark"] .main_wrapper {
          --tv-body: #e08a5a;
          --tv-light: #f2b590;
          --tv-knob: #1c1c1c;
          --tv-knob-inset: #4a4a4a;
        }

        :root[data-theme="light"] .main_wrapper {
          --tv-body: #d97a52;
          --tv-light: #eda587;
          --tv-knob: #3a3632;
          --tv-knob-inset: #6b645c;
        }

        .main_wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30em;
          height: 30em;
          position: relative;
        }

        .main {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-top: 5em;
          z-index: 10;
        }

        .antenna {
          width: 5em;
          height: 5em;
          border-radius: 50%;
          border: 2px solid black;
          background-color: var(--tv-body);
          margin-bottom: -6em;
          margin-left: 0em;
          z-index: -1;
          position: relative;
        }

        .antenna_shadow {
          position: absolute;
          background-color: transparent;
          width: 50px;
          height: 56px;
          margin-left: 1.68em;
          border-radius: 45%;
          transform: rotate(140deg);
          border: 4px solid transparent;
          box-shadow: inset 0px 16px rgba(60, 45, 25, 0.35),
            inset 0px 16px 1px 1px rgba(60, 45, 25, 0.35);
        }

        .antenna::after {
          content: "";
          position: absolute;
          margin-top: -9.4em;
          margin-left: 0.4em;
          transform: rotate(-25deg);
          width: 1em;
          height: 0.5em;
          border-radius: 50%;
          background-color: var(--tv-light);
        }

        .antenna::before {
          content: "";
          position: absolute;
          margin-top: 0.2em;
          margin-left: 1.25em;
          transform: rotate(-20deg);
          width: 1.5em;
          height: 0.8em;
          border-radius: 50%;
          background-color: var(--tv-light);
        }

        .a1 {
          position: relative;
          top: -102%;
          left: -130%;
          width: 12em;
          height: 5.5em;
          border-radius: 50px;
          background-image: linear-gradient(#171717, #171717, #353535, #353535, #171717);
          transform: rotate(-29deg);
          clip-path: polygon(50% 0%, 49% 100%, 52% 100%);
        }

        .a1d {
          position: relative;
          top: -211%;
          left: -35%;
          transform: rotate(45deg);
          width: 0.5em;
          height: 0.5em;
          border-radius: 50%;
          border: 2px solid black;
          background-color: #979797;
          z-index: 99;
        }

        .a2 {
          position: relative;
          top: -210%;
          left: -10%;
          width: 12em;
          height: 4em;
          border-radius: 50px;
          background-color: #171717;
          background-image: linear-gradient(#171717, #171717, #353535, #353535, #171717);
          margin-right: 5em;
          clip-path: polygon(47% 0, 47% 0, 34% 34%, 54% 25%, 32% 100%, 29% 96%, 49% 32%, 30% 38%);
          transform: rotate(-8deg);
        }

        .a2d {
          position: relative;
          top: -294%;
          left: 94%;
          width: 0.5em;
          height: 0.5em;
          border-radius: 50%;
          border: 2px solid black;
          background-color: #979797;
          z-index: 99;
        }

        .notfound_text {
          background-color: black;
          padding-left: 0.3em;
          padding-right: 0.3em;
          font-size: 0.75em;
          color: white;
          letter-spacing: 0;
          border-radius: 5px;
          z-index: 10;
        }

        .tv {
          width: 17em;
          height: 9em;
          margin-top: 3em;
          border-radius: 15px;
          background-color: var(--tv-body);
          display: flex;
          justify-content: center;
          border: 2px solid #1d0e01;
          box-shadow: inset 0.2em 0.2em var(--tv-light);
          position: relative;
        }

        .tv::after {
          content: "";
          position: absolute;
          width: 17em;
          height: 9em;
          border-radius: 15px;
          background: repeating-radial-gradient(
                var(--tv-body) 0 0.0001%,
                #00000070 0 0.0002%
              )
              50% 0/2500px 2500px,
            repeating-conic-gradient(var(--tv-body) 0 0.0001%, #00000070 0 0.0002%) 60%
              60%/2500px 2500px;
          background-blend-mode: difference;
          opacity: 0.09;
        }

        .curve_svg {
          position: absolute;
          margin-top: 0.25em;
          margin-left: -0.25em;
          height: 12px;
          width: 12px;
        }

        .display_div {
          display: flex;
          align-items: center;
          align-self: center;
          justify-content: center;
          border-radius: 15px;
          box-shadow: 3.5px 3.5px 0px var(--tv-light);
        }

        .screen_out1 {
          width: 11em;
          height: 7.75em;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
        }

        .screen {
          width: 13em;
          height: 7.85em;
          font-family: var(--font-display), sans-serif;
          border: 2px solid #1d0e01;
          background: repeating-radial-gradient(#000 0 0.0001%, #ffffff 0 0.0002%) 50% 0/2500px
              2500px,
            repeating-conic-gradient(#000 0 0.0001%, #ffffff 0 0.0002%) 60% 60%/2500px 2500px;
          background-blend-mode: difference;
          animation: b_anim 0.2s infinite alternate;
          border-radius: 10px;
          z-index: 99;
          display: flex !important;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: #252525;
          letter-spacing: 0.15em;
          text-align: center;
        }

        .screenM {
          display: none !important;
        }

        @keyframes b_anim {
          100% {
            background-position: 50% 0, 60% 50%;
          }
        }

        /* Ekran titremesi sürekli hareket eden bir animasyon.
           Hareket hassasiyeti olan kullanıcılar için durduruyoruz. */
        @media (prefers-reduced-motion: reduce) {
          .screen {
            animation: none;
          }
        }

        .lines {
          display: flex;
          column-gap: 0.1em;
          align-self: flex-end;
        }

        .line1,
        .line3 {
          width: 2px;
          height: 0.5em;
          background-color: black;
          border-radius: 25px 25px 0px 0px;
          margin-top: 0.5em;
        }

        .line2 {
          flex-grow: 1;
          width: 2px;
          height: 1em;
          background-color: black;
          border-radius: 25px 25px 0px 0px;
        }

        .buttons_div {
          width: 4.25em;
          align-self: center;
          height: 8em;
          background-color: color-mix(in srgb, var(--tv-body) 82%, #000);
          border: 2px solid #1d0e01;
          padding: 0.6em;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          row-gap: 0.75em;
          box-shadow: 3px 3px 0px color-mix(in srgb, var(--tv-body) 82%, #000);
        }

        .b1,
        .b2 {
          width: 1.65em;
          height: 1.65em;
          border-radius: 50%;
          background-color: var(--tv-knob);
          border: 2px solid black;
          box-shadow: inset 2px 2px 1px var(--tv-knob-inset), -2px 0px #101010,
            -2px 0px 0px 1px black;
          position: relative;
        }

        .b1::before,
        .b1::after,
        .b2::before,
        .b2::after {
          content: "";
          position: absolute;
          background-color: #000000;
          border-radius: 5px;
        }

        .b1::before {
          margin-top: 1em;
          margin-left: 0.5em;
          transform: rotate(47deg);
          width: 0.1em;
          height: 0.4em;
        }

        .b1::after {
          margin-top: 0.9em;
          margin-left: 0.8em;
          transform: rotate(47deg);
          width: 0.1em;
          height: 0.55em;
        }

        .b1 div {
          position: absolute;
          margin-top: -0.1em;
          margin-left: 0.65em;
          transform: rotate(45deg);
          width: 0.15em;
          height: 1.5em;
          background-color: #000000;
        }

        .b2::before {
          margin-top: 1.05em;
          margin-left: 0.8em;
          transform: rotate(-45deg);
          width: 0.15em;
          height: 0.4em;
        }

        .b2::after {
          margin-top: -0.1em;
          margin-left: 0.65em;
          transform: rotate(-45deg);
          width: 0.15em;
          height: 1.5em;
        }

        .speakers {
          display: flex;
          flex-direction: column;
          row-gap: 0.5em;
        }

        .speakers .g1 {
          display: flex;
          column-gap: 0.25em;
        }

        .speakers .g1 div {
          width: 0.65em;
          height: 0.65em;
          border-radius: 50%;
          background-color: var(--tv-knob);
          border: 2px solid black;
          box-shadow: inset 1.25px 1.25px 1px var(--tv-knob-inset);
        }

        .speakers .g {
          width: auto;
          height: 2px;
          background-color: #171717;
        }

        .bottom {
          width: 100%;
          height: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          column-gap: 8.7em;
        }

        .base1,
        .base2 {
          height: 1em;
          width: 2em;
          border: 2px solid #171717;
          background-color: #4d4d4d;
          margin-top: -0.15em;
          z-index: -1;
        }

        .base3 {
          position: absolute;
          height: 0.15em;
          width: 17.5em;
          background-color: #171717;
          margin-top: 0.8em;
        }

        .text_404 {
          position: absolute;
          display: flex;
          flex-direction: row;
          column-gap: 6em;
          z-index: 1;
          margin-bottom: 2em;
          align-items: center;
          justify-content: center;
          opacity: 0.2;
          font-family: var(--font-heading), sans-serif;
          color: var(--accent);
          pointer-events: none;
        }

        .text_4041,
        .text_4042,
        .text_4043 {
          transform: scaleY(24.5) scaleX(9);
          display: inline-block;
        }

        @media only screen and (max-width: 495px) {
          .text_404 {
            column-gap: 6em;
          }
        }
        @media only screen and (max-width: 395px) {
          .text_404 {
            column-gap: 4em;
          }
          .text_4041,
          .text_4042,
          .text_4043 {
            transform: scaleY(25) scaleX(8);
          }
        }
      `}</style>
            {children}
        </>
    );
}