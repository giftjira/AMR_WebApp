import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Paper,
  Container
} from '@mui/material';
import {
  Build as BuildIcon,
  Handyman as HandymanIcon,
  ControlCamera as ControlIcon,
  ViewInAr as VirtualIcon
} from '@mui/icons-material';
import { Grid } from '@mui/material';


function MainPage() {
  const navigate = useNavigate();

  const menuItems = [
    {
      title: 'Part Preparation',
      icon: <BuildIcon sx={{ fontSize: 40 }} />,
      path: '/pare-preparation',
      color: '#1976d2',
      bgcolor: '#e3f2fd'
    },
    {
      title: 'Packing Preparation',
      icon: <HandymanIcon sx={{ fontSize: 40 }} />,
      path: '/picking-preparation',
      color: '#2e7d32',
      bgcolor: '#e8f5e9'
    },
    {
      title: 'Manual Control',
      icon: <ControlIcon sx={{ fontSize: 40 }} />,
      path: '/manual-control',
      color: '#ed6c02',
      bgcolor: '#fff3e0'
    },
    {
      title: 'Virtual',
      icon: <VirtualIcon sx={{ fontSize: 40 }} />,
      path: '/virtual',
      color: '#9c27b0',
      bgcolor: '#f3e5f5'
    }
  ];

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Welcome to Panasonic Control System
        </Typography>
        <Typography variant="subtitle1" gutterBottom align="center" color="text.secondary">
          Please select a module to proceed
        </Typography>
      </Box>

      <Grid
            container
            spacing={3}
            justifyContent="center"
            alignItems="stretch"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',        // อนุญาตให้ wrap แต่เราจะบังคับไม่ให้ wrap
              maxWidth: '100%',
              gap: 3
            }}
          >
            {menuItems.map((item) => (
              <Box
                key={item.title}
                sx={{
                  flex: '1 1 22%', // 4 ปุ่มในแถวเดียว (ประมาณ 25% - เผื่อ spacing)
                  display: 'flex',
                  justifyContent: 'center',
                  minWidth: '200px',
                  maxWidth: '250px'
                }}
              >
                <Paper
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    width: '100%',
                    minHeight: 180,
                    backgroundColor: item.bgcolor,
                    '&:hover': {
                      transform: 'scale(1.05)',
                      backgroundColor: item.bgcolor
                    }
                  }}
                  onClick={() => navigate(item.path)}
                >
                  <Box sx={{ color: item.color, mb: 2 }}>
                    {item.icon}
                  </Box>
                  <Typography variant="h6" component="h2" align="center">
                    {item.title}
                  </Typography>
                </Paper>
              </Box>
            ))}
          </Grid>


    </Container>
  );
}

export default MainPage; 