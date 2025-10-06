import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Container, 
  Button, 
  Box,
  CssBaseline
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';

// Import pages
import MainPage from './pages/MainPage';
import ParePreparation from './pages/ParePreparation';
import PickingPreparation from './pages/PickingPreparation';
import ManualControl from './pages/ManualControl';
import Virtual from './pages/Virtual';
import Troubleshooting from './pages/Troubleshooting';


const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ flexGrow: 1 }}>
          <AppBar position="static">
            <Toolbar>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Panasonic Control System
              </Typography>
              <Button 
                color="inherit" 
                component={Link} 
                to="/"
                startIcon={<HomeIcon />}
              >
                Home
              </Button>
            </Toolbar>
          </AppBar>
          
          <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Routes>
              <Route path="/" element={<MainPage />} />
              <Route path="/pare-preparation" element={<ParePreparation />} />
              <Route path="/picking-preparation" element={<PickingPreparation />} />
              <Route path="/manual-control" element={<ManualControl />} />
              <Route path="/virtual" element={<Virtual />} />
              <Route path="/troubleshooting" element={<Troubleshooting />} />
            </Routes>
          </Container>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;
