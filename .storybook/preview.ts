import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      viewports: {
        mobile_small: {
          name: "Mobile Small",
          styles: {
            width: "320px",
            height: "568px",
          },
        },
        mobile: {
          name: "Mobile",
          styles: {
            width: "375px",
            height: "667px",
          },
        },
        tablet: {
          name: "Tablet",
          styles: {
            width: "768px",
            height: "1024px",
          },
        },
        desktop: {
          name: "Desktop",
          styles: {
            width: "1280px",
            height: "800px",
          },
        },
        wide: {
          name: "Wide Desktop",
          styles: {
            width: "1920px",
            height: "1080px",
          },
        },
      },
      defaultViewport: "desktop",
    },
  },

  globalTypes: {
    theme: {
      description: "Global theme for all stories",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "circlehollow", title: "Light" },
          { value: "dark", icon: "circle", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },

  decorators: [
    (Story, context) => {
      const theme = context.globals.theme;
      const isDark = theme === "dark";

      return (
        <div className={isDark ? "dark" : ""}>
          <div
            className={`min-h-screen ${
              isDark
                ? "bg-gray-950 text-white"
                : "bg-white text-gray-900"
            }`}
          >
            <Story />
          </div>
        </div>
      );
    },
  ],
};

export default preview;
