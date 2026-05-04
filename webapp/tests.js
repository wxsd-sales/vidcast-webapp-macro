const example = {
    name: "Laptop vs Cisco Desk Device",
    description: "Video description",
    created: "1764610200452",
    user_name: "Example User 1",
    duration: "43840",
    description:
      "Show the best possible video experience compared to a standard laptop video experience.  (0:43)",
    camera_thumbnail_asset_url:
      "https://samplelib.com/lib/preview/jpeg/sample-clouds-400x300.jpg",
    matrix_thumbnail_asset_url:
      "https://cdn-3-d.app.vidcast.io/5b/52/dc/5b52dcb0-96d7-4309-a666-72907d17e743/thumbnail_matrix_1704920603331.jpeg?Expires=1766505481&Signature=lJTVlVu2K626d7N7d8ZZwb5dxAdah2Qi9eAZVHR~4wIhe03lADo13sVl10XZMvblIKBwbSEw0lNVxfI8HJLRGabHE0Ajd9I9nXTXsSCP4MjBXJFPVrWpTfjyqSNV8sBOTNHPz8u~2jOV456y6oxTGbYOMfoXS3Z9qiqMoiNn61d1fJcAnncDLAYxed4a94QWCywyP6JimaeUvkBpaSTqA2W51vPHZ-wXOzf1Su3ZR77~z1Ppb3lHpXnG2~TlHQ3ZyELc8X-Z0bM2BoC5cBddhxxb1cU8u2DYN4diUS91HrECayHgEZ9RhVOaMJ8F7eHpTcEBAyN3lZHx~wnZgZ521w__&Key-Pair-Id=K7MMR7AZ73QPM",
    camera_asset_url: "https://samplelib.com/mp4/sample-5s.mp4",
    preview_asset_url:
      "https://cdn-3-e.app.vidcast.io/5b/52/dc/5b52dcb0-96d7-4309-a666-72907d17e743/preview_cb42795a-e769-441e-ac6f-eeeb21a752a5_processed.mp4?Expires=1766505481&Signature=QXymrK52ohe4YkseXIcH0LB-l4Opf~zMfPjLPaYsKqfL~TYxFAoKuOSvhD9AnMUsZLvSRTtUqV5FSJoY4IKxU~B5d-~TgLzD5ENSX1~iWaGtaUm8PrWPWYE3szBif6mGLU559v8Ya6Hvahojmwc83myw25CtTb4k~whY9MpJrMWl6J-1vPbR0a52jXKTl~WL~ann2QCdX1aUouoO5Go-2DdxxuCMZF8wpWZI6RbI80Wj29JbYczAbARR8xVOmSX11wx2n5In3fE6MvS5PsgakAjDtKxOdjg4HcBWFEQ26-nJPAUlaEpzdNZhkpf8cGASySYr~LOM5QrY~2ZqD0LcGA__&Key-Pair-Id=K7MMR7AZ73QPM",
    avatar_url: "https://randomuser.me/api/portraits/men/11.jpg"
  };

export const testPlaylist = new Array(20).fill(example).map((item, index) => {return {...item, id: (index+1).toString()} });