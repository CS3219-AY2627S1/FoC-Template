/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#173F5F',
      dark: '#0F2F48',
      light: '#DCEAF2',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#2A7F7A',
      dark: '#1F625E',
      light: '#DDF1EE',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F3F5F7',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#17232D',
      secondary: '#5C6B76',
    },
    divider: '#DCE3E7',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h3: {
      fontWeight: 750,
      letterSpacing: '-0.03em',
    },
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.025em',
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.015em',
    },
    h6: {
      fontWeight: 650,
    },
    button: {
      fontWeight: 650,
      letterSpacing: '0.01em',
      textTransform: 'none',
    },
  },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': {
            outline: '2px solid #173F5F',
            outlineOffset: 2,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: 10,
          paddingInline: 18,
          boxShadow: 'none',
        },
        contained: {
          '&:hover': {
            boxShadow: '0 8px 18px rgba(23, 63, 95, 0.22)',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 14,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 650,
        },
      },
    },
  },
})

export default theme
