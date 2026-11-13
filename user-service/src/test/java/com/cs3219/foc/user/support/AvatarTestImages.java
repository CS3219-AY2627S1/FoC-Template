package com.cs3219.foc.user.support;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.springframework.mock.web.MockMultipartFile;

public final class AvatarTestImages {
    private AvatarTestImages() {}

    public static MockMultipartFile image(String format, int width, int height) throws IOException {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0xff0000);
        try (var output = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, format, output)) {
                throw new IOException("Test image format is unavailable");
            }
            return new MockMultipartFile("file", "photo." + format, "image/" + format, output.toByteArray());
        } finally {
            image.flush();
        }
    }
}
