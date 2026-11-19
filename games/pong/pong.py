import pygame, sys, random

def ball_animation():
    global ball_speed_x, ball_speed_y, player_score, opponent_score
    ball.x += ball_speed_x
    ball.y += ball_speed_y
    
    if ball.top <= 0 or ball.bottom >= screen_height:
        ball_speed_y *= -1
    if ball.left <= 0:
        player_score += 1
        ball_restart()
    elif ball.right >= screen_width:
        opponent_score += 1
        ball_restart()
    
    if ball.colliderect(player) or ball.colliderect(opponent):
        ball_speed_x *= -1

def player_animation():
    player.y += player_speed    
    
    if player.top <= 0:
        player.top = 0
    if player.bottom >= screen_height:
        player.bottom = screen_height

def opponent_ai():
    if opponent.top < ball.y:
        opponent.top += opponent_speed
    if opponent.bottom >= ball.y:
        opponent.bottom -= opponent_speed
    if opponent.top <= 0:
        opponent.top = 0
    if opponent.bottom >= screen_height:
        opponent.bottom = screen_height

def opponent_animation():
    keys = pygame.key.get_pressed()

    if keys[pygame.K_w]:
        opponent.y -= 7
    if keys[pygame.K_s]:
        opponent.y += 7

    opponent.clamp_ip(screen.get_rect())

def ball_restart():
    global ball_speed_x, ball_speed_y
    ball.center = (screen_width/2,screen_height/2)
    ball_speed_y *= random.choice((1,-1))
    ball_speed_x *= random.choice((1,-1))

def restart_game():
    global ball_speed_x, ball_speed_y, player_speed, player_score, opponent_score
    ball.center = (screen_width // 2, screen_height // 2)
    player.center = (screen_width - 15, screen_height // 2)
    opponent.center = (15, screen_height // 2)
    ball_speed_x = 7 * random.choice((1,-1))
    ball_speed_y = 7 * random.choice((1,-1))
    player_speed = 0
    player_score = 0
    opponent_score = 0
    
#general setup
pygame.init()
clock = pygame.time.Clock()
score_font = pygame.font.Font(None, 36)
button_font = pygame.font.Font(None, 28)
title_font = pygame.font.Font(None, 56)

#Set up for main window
screen_width = 640
screen_height = 480
screen = pygame.display.set_mode(
    (screen_width,screen_height), pygame.RESIZABLE)
pygame.display.set_caption('Pong')

#game rectengles
ball = pygame.Rect(screen_width/2 -15, screen_height/2-15,30,30)
player = pygame.Rect(screen_width-20,screen_height/2-70,10,140)
opponent = pygame.Rect(10,screen_height/2-70,10,140)

black = (44, 47, 46)
white = (244,245,245)
green = (34,110,63)

ball_speed_x = 7 * random.choice((1,-1))
ball_speed_y = 7 * random.choice((1,-1))
player_speed = 0
opponent_speed = 7
player_score = 0
opponent_score = 0
menu_button = pygame.Rect(0, 0, 110, 34)
menu_button.center = (screen_width // 2, 30)
self_play_button = pygame.Rect(0, 0, 220, 54)
one_v_one_button = pygame.Rect(0, 0, 220, 54)
restart_button = pygame.Rect(0, 0, 220, 48)
resume_button = pygame.Rect(0, 0, 220, 48)
game_mode = None
menu_active = True

while True:
    menu_center_x = screen_width // 2
    menu_center_y = screen_height // 2
    self_play_button.center = (menu_center_x, menu_center_y - 38)
    one_v_one_button.center = (menu_center_x, menu_center_y + 30)
    restart_button.center = (menu_center_x, menu_center_y + 98)
    resume_button.center = (menu_center_x, menu_center_y + 158)

    #handling input
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        elif event.type == pygame.VIDEORESIZE:
            screen_width, screen_height = event.w,event.h
            screen = pygame.display.set_mode(
                (screen_width, screen_height), pygame.RESIZABLE
            )
            player.right = screen_width - 10
            menu_button.center = (screen_width // 2, 30)
        elif menu_active:
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if self_play_button.collidepoint(event.pos):
                    game_mode = "selfplay"
                    menu_active = False
                    restart_game()
                elif one_v_one_button.collidepoint(event.pos):
                    game_mode = "1v1"
                    menu_active = False
                    restart_game()
                elif game_mode is not None and restart_button.collidepoint(event.pos):
                    menu_active = False
                    restart_game()
                elif game_mode is not None and resume_button.collidepoint(event.pos):
                    menu_active = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_1:
                    game_mode = "selfplay"
                    menu_active = False
                    restart_game()
                elif event.key == pygame.K_2:
                    game_mode = "1v1"
                    menu_active = False
                    restart_game()
                elif game_mode is not None and event.key == pygame.K_r:
                    menu_active = False
                    restart_game()
                elif game_mode is not None and event.key == pygame.K_ESCAPE:
                    menu_active = False
        else:
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                menu_button.center = (screen_width // 2, 30)
                if menu_button.collidepoint(event.pos):
                    menu_active = True
                    player_speed = 0
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_m:
                    menu_active = True
                    player_speed = 0
                elif event.key == pygame.K_DOWN:
                    player_speed += 7
                elif event.key == pygame.K_UP:
                    player_speed -= 7
            elif event.type == pygame.KEYUP:
                if event.key == pygame.K_DOWN:
                    player_speed -= 7
                elif event.key == pygame.K_UP:
                    player_speed += 7

    if menu_active:
        screen.fill(green)
        title_text = title_font.render("PONG", True, white)
        screen.blit(title_text, title_text.get_rect(center=(menu_center_x, menu_center_y - 136)))
        pygame.draw.rect(screen, white, self_play_button, border_radius=4)
        pygame.draw.rect(screen, white, one_v_one_button, border_radius=4)
        self_play_text = button_font.render("VS CPU  (1)", True, black)
        one_v_one_text = button_font.render("1 VS 1  (2)", True, black)
        screen.blit(self_play_text, self_play_text.get_rect(center=self_play_button.center))
        screen.blit(one_v_one_text, one_v_one_text.get_rect(center=one_v_one_button.center))
        if game_mode is not None:
            pygame.draw.rect(screen, white, restart_button, border_radius=4)
            pygame.draw.rect(screen, white, resume_button, border_radius=4)
            restart_text = button_font.render("RESTART  (R)", True, black)
            resume_text = button_font.render("RESUME  (ESC)", True, black)
            screen.blit(restart_text, restart_text.get_rect(center=restart_button.center))
            screen.blit(resume_text, resume_text.get_rect(center=resume_button.center))
    else:
        ball_animation()
        player_animation()
        if game_mode == "selfplay":
            opponent_ai()
        else:
            opponent_animation()

        screen.fill(green)
        pygame.draw.rect(screen,white,player)
        pygame.draw.rect(screen,white,opponent)
        pygame.draw.aaline(screen,black,(screen_width/2,0),(screen_width/2,screen_height))
        pygame.draw.ellipse(screen,white,ball)
        opponent_name = "CPU" if game_mode == "selfplay" else "PLAYER 1"
        player_name = "YOU" if game_mode == "selfplay" else "PLAYER 2"
        opponent_score_text = score_font.render(f"{opponent_name}({opponent_score})", True, white)
        player_score_text = score_font.render(f"{player_name}({player_score})", True, white)
        screen.blit(opponent_score_text, opponent_score_text.get_rect(center=(screen_width // 4, 30)))
        screen.blit(player_score_text, player_score_text.get_rect(center=(screen_width * 3 // 4, 30)))
        menu_button.center = (screen_width // 2, 30)
        pygame.draw.rect(screen, white, menu_button, border_radius=4)
        menu_text = button_font.render("MENU  (M)", True, black)
        screen.blit(menu_text, menu_text.get_rect(center=menu_button.center))
    
    #udating the window
    pygame.display.flip()
    clock.tick(60)