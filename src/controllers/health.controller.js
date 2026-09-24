export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: "TripWise API is running",
  });
};
